/*
 * ESP32 CI-V Gateway v1.0
 * Gateway CI-V para Icom IC-705 via BLE + 4 portas fisicas
 *
 * Recursos:
 * - Conexao BLE Central ao IC-705 com handshake de pareamento
 * - Polling de frequencia, modo, PTT, banda, AGC, preamp, att, S-meter
 * - Controle completo: liga/desliga, PTT, frequencia, modo, banda, AGC, preamp
 * - 4 portas CI-V fisicas (UART1, UART2, UART3, GPIO)
 * - Bridge bidirecional entre IC-705 e portas fisicas
 * - Interface Web completa com dashboard de controle remoto
 * - API REST para todos os comandos CI-V
 * - WiFi AP + STA simultaneo
 * - BLE NUS (peripheral) para apps smartphone
 *
 * Placa: ESP32S3 Dev Module | 16MB Flash | OPI PSRAM | Huge APP
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HardwareSerial.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEAdvertisedDevice.h>
#include <BLEClient.h>

// ===================== HARDWARE =====================
#define FIRMWARE_VERSION "1.0.1"
#define PIN_LED 2
#define PORT1_RX 16
#define PORT1_TX 17
#define PORT2_RX 18
#define PORT2_TX 19
#define PORT3_RX 20
#define PORT3_TX 21
#define PORT4_RX 14
#define PORT4_TX 15
#define DEFAULT_BAUD 19200
#define SERIAL_BAUD 115200
#define WIFI_CLIENT_TIMEOUT 15000

// ===================== BLE UUIDs =====================
#define IC705_SVC  "14cf8001-1ec2-d408-1b04-2eb270f14203"
#define IC705_CHAR "14cf8002-1ec2-d408-1b04-2eb270f14203"
#define NUS_SVC    "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX     "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX     "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

// ===================== CI-V CONSTANTS =====================
#define CIV_CTRL 0xE0  // Nosso endereco no barramento
uint8_t civ_ic705_addr = 0xA4; // Endereco CI-V do IC-705 (configuravel)
#define CIV_PRE 0xFE
#define CIV_END 0xFD

// ===================== CONFIG =====================
// Configuracao de logs habilitados por tipo
struct LogCfg { bool ble:1, civ:1, ic5:1, wifi:1, sys:1, erro:1; };
LogCfg log_enabled = {true,true,true,true,true,true};

// ===================== AUTENTICACAO =====================
#define MAX_USERS 10
struct User { char name[20]; char pass[20]; };
User users[MAX_USERS];
int user_count = 0;
char auth_token[16] = ""; // "logged" se autenticado
unsigned long auth_timeout = 0;

bool checkAuth() {
  if(strcmp(auth_token,"logged")==0 && millis()<auth_timeout) return true;
  return false;
}
void loginOK() { strcpy(auth_token,"logged"); auth_timeout=millis()+3600000; } // 1h
void logout() { auth_token[0]=0; auth_timeout=0; }

struct Config {
  String ap_ssid = "ESP32-CIV";
  String ap_pass = "12345678";
  String sta_ssid = "";
  String sta_pass = "";
  bool sta_dhcp = true;
  IPAddress sta_ip, sta_gw, sta_sn = IPAddress(255,255,255,0), sta_d1 = IPAddress(8,8,8,8), sta_d2 = IPAddress(8,8,4,4);
  String bt_name = "ESP32-CIV-GW";
  String bt_pass = "1234";
  bool cat_enabled = true;
  uint8_t cat_port = 0;
  uint8_t cat_addr = 0xA4;
  uint8_t radio_addr = 0xE0;
  uint8_t civ_addr[4] = {0x94,0x94,0x94,0x94};
  uint32_t civ_baud[4] = {DEFAULT_BAUD,DEFAULT_BAUD,DEFAULT_BAUD,DEFAULT_BAUD};
  uint8_t active_port = 1;
} cfg;

WebServer srv(80);
HardwareSerial p1(1), p2(2), p3(3);
Preferences nvs;
HardwareSerial* act_civ = &p1;

// BLE Central (IC-705)
BLEClient* ic5cli = NULL;
BLERemoteCharacteristic* ic5ch = NULL;
bool ic5con = false, ic5pair = false, ic5civ = false, ic5docon = false;
BLEAddress* ic5addr = NULL;
BLEAddress* last_ic5_addr = NULL; // ultimo endereco para reconexao

// BLE Peripheral (NUS)
BLEServer* nuss = NULL;
BLECharacteristic* nustx = NULL, *nusrx = NULL;
bool nuscon = false;
uint8_t nusbuf[512]; volatile int nuslen = 0;

// Sistema de logs com filtro por tipo
#define LOG_MAX 200
#define LOG_LEN 120
struct LogEntry { unsigned long time; char type[8]; char msg[LOG_LEN]; };
LogEntry logbuf[LOG_MAX];
int logidx = 0;
int logcount = 0;

void addLog(const char* type, const char* fmt, ...) {
  // Verifica se este tipo de log esta habilitado
  bool ok=false;
  if(strcmp(type,"BLE")==0) ok=log_enabled.ble;
  else if(strcmp(type,"CIV")==0) ok=log_enabled.civ;
  else if(strcmp(type,"IC705")==0) ok=log_enabled.ic5;
  else if(strcmp(type,"WIFI")==0||strcmp(type,"WiFi")==0) ok=log_enabled.wifi;
  else if(strcmp(type,"ERRO")==0) ok=log_enabled.erro;
  else ok=log_enabled.sys;
  if(!ok) return;

  LogEntry& e=logbuf[logidx];
  e.time=millis();
  strncpy(e.type,type,7); e.type[7]=0;
  va_list ap; va_start(ap,fmt);
  vsnprintf(e.msg,LOG_LEN-1,fmt,ap);
  va_end(ap);
  logidx=(logidx+1)%LOG_MAX;
  if(logcount<LOG_MAX) logcount++;
}

// Buffer RX IC-705
#define RXBUF 512
String last_ic5_addr_str = ""; // ultimo endereco do IC-705 (persistente)
uint8_t rxbuf[RXBUF]; int rxlen = 0; bool rxrdy = false;

// Gerenciamento de dispositivos Bluetooth pareados
#define MAX_BT_DEVICES 20
struct BTDevice { String name; String addr; };
BTDevice bt_devices[MAX_BT_DEVICES];
int bt_device_count = 0;
bool ble_scan_active = false;
bool echo_sent = false; // flag para enviar Echo Back apos CI-V grant
String ble_scan_results = "[]";

// Status IC-705
uint64_t ic5_freq = 0;
uint8_t ic5_mode = 0, ic5_filt = 0, ic5_ptt = 0, ic5_band = 0;
uint8_t ic5_agc = 0, ic5_pre = 0, ic5_att = 0, ic5_rf = 50, ic5_af = 50;
uint8_t ic5_smeter = 0, ic5_pwr = 1, ic5_split = 0;
char ic5_mode_str[8] = "USB";
unsigned long last_poll = 0, last_smeter = 0;
bool pending_cmd = false;
uint8_t pending_buf[32]; int pending_len = 0;

// WiFi scan
// Multi-WiFi: ate 10 redes salvas com prioridade
#define MAX_WIFI_NETS 10
struct WiFiNet { String ssid; String pass; };
WiFiNet wifi_nets[MAX_WIFI_NETS];
int wifi_net_count = 0;
int wifi_net_current = -1;
bool wifi_connecting = false;
unsigned long wifi_conn_start = 0;

bool sta_con = false, scan_busy = false; int scan_n = 0; String scan_json = "[]";

// ===================== CI-V COMMAND ENUM =====================
enum CIVCmd {
  C_F_READ = 0x03, C_F_SET = 0x07,
  C_M_READ = 0x04, C_M_SET = 0x06,
  C_PTT_READ = 0x1C, C_PTT_ON = 0x1C, C_PTT_OFF = 0x1C,
  C_PWR_ON = 0x24, C_PWR_OFF = 0x24, C_PWR_READ = 0x1A,
  C_AGC_READ = 0x16, C_AGC_SET = 0x16,
  C_PRE_READ = 0x16, C_PRE_OFF = 0x16, C_PRE_ON = 0x16, C_PRE_ON2 = 0x16,
  C_ATT_READ = 0x11, C_ATT_OFF = 0x11, C_ATT_ON = 0x11,
  C_RF_READ = 0x14, C_RF_SET = 0x14,
  C_AF_READ = 0x15, C_AF_SET = 0x15,
  C_SMETER = 0x15,
  C_SPLIT_READ = 0x0F, C_SPLIT_OFF = 0x0F, C_SPLIT_ON = 0x0F,
  C_MEM_READ = 0x1A,
  C_BAND_READ = 0x1A,
};

// Modos
const char* mode_names[] = {"LSB","USB","AM","CW","RTTY","FM","WFM","CW-R","RTTY-R","DV","","","","","","","","","","","","","","DD","","","","","","","","","","","ATV"};
#define MODE_LSB 0
#define MODE_USB 1
#define MODE_AM 2
#define MODE_CW 3
#define MODE_RTTY 4
#define MODE_FM 5
#define MODE_CWR 7
#define MODE_RTTYR 8
#define MODE_DV 23
#define MODE_DD 34
#define MODE_ATV 35

// ===================== PROTOTYPES =====================
void load_cfg(); void save_cfg();
void setup_ap(); void setup_sta();
void setup_nus(); void setup_ws();
void scan_ic5(); void conn_ic5(BLEAddress a); void pair_ic5(); void send_civ(uint8_t* d, int l);
void poll_ic5(); void proc_ic5(); void parse_civ(uint8_t* d, int l);
uint64_t bcd_freq(uint8_t* d, int off, int n);
void set_freq(uint64_t f); void set_mode(uint8_t m); void set_ptt(bool on);
void set_pwr(bool on); void set_agc(uint8_t v); void set_pre(uint8_t v);
void set_att(uint8_t v); void set_rf(uint8_t v); void set_af(uint8_t v);
void set_split(bool on);
void bridge_ic5p(); void bridge_pic5(); void bridge_nusp(); void bridge_pnus();
void sel_port(uint8_t p); void rst_port(uint8_t p);
void serial_cmd(); void wifi_scan(); void wifi_chk();
HardwareSerial* gp(uint8_t p);

void h_root(); void h_cfg(); void h_sts(); void h_scan(); void h_save(); void h_civ_cmd(); void h_404(); void h_logs(); void h_login(); void h_logout(); void h_login_page();
void h_wifi_nets();
void h_ble_scan();
void h_bt_devices();

// ===================== BLE CALLBACKS =====================
class ICCB : public BLEClientCallbacks {
  void onConnect(BLEClient*) { addLog("IC705","BLE conectado"); Serial.println("[IC705] BLE conectado"); }
  void onDisconnect(BLEClient*) { ic5con=false; ic5civ=false; ic5pair=false; echo_sent=false; addLog("IC705","BLE desconectado"); Serial.println("[IC705] BLE desconectado"); }
};

static void ic5cb(BLERemoteCharacteristic* pChar, uint8_t* d, size_t l, bool) {
  if (l > RXBUF) l = RXBUF;
  if (l>=4 && d[0]==0xFE && d[1]==0xF1 && d[2]==0x00) {
    switch(d[3]) {
      case 0x61: Serial.println("[IC705] UUID ok"); break;
      case 0x62: Serial.println("[IC705] Nome ok"); break;
      case 0x63: Serial.println(d[4]==0x01?"[IC705] Pareado!":"[IC705] Ja pareado"); ic5pair=true; break;
      case 0x64: addLog("IC705","CI-V concedido!"); Serial.println("[IC705] CI-V concedido!"); ic5civ=true; ic5con=true; break;
    }
    return;
  }
  // Dados CI-V recebidos via notificacao
  if(d[0]==0xFE && d[1]==0xFE){
    if (!rxrdy) { memcpy(rxbuf,d,l); rxlen=l; rxrdy=true; }
  }
}

class NSCB : public BLEServerCallbacks {
  void onConnect(BLEServer*) { nuscon=true; Serial.println("[NUS] App conectado"); }
  void onDisconnect(BLEServer*) { nuscon=false; BLEDevice::startAdvertising(); }
};
class NRCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) {
    String v=c->getValue(); int l=v.length();
    if(l>0&&l<=512){memcpy((void*)nusbuf,v.c_str(),l);nuslen=l;}
  }
};

class IC5AdvCB : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice a) {
    if (a.haveServiceUUID() && a.getServiceUUID().equals(BLEUUID(IC705_SVC))) {
      Serial.printf("[IC705] Encontrado: %s\n", a.getAddress().toString().c_str());
      a.getScan()->stop(); ic5addr=new BLEAddress(a.getAddress()); ic5docon=true;
    }
  }
};

// ===================== NVS =====================
// Todas as chaves NVS sao fixas e versionadas.
// Versoes futuras do firmware DEVEM manter estas chaves para preservar configs.
// Tabela de chaves:
//   ver  - uint8  - versao do formato (incrementar ao alterar estrutura)
//   ap_s - string - AP SSID
//   ap_p - string - AP password
//   bt_n - string - BLE nome
//   st_s - string - STA SSID
//   st_p - string - STA password
//   st_d - uint8  - STA DHCP (0/1)
//   st_i - uint32 - STA IP
//   st_g - uint32 - STA gateway
//   st_m - uint32 - STA subnet
//   st_1 - uint32 - DNS1
//   st_2 - uint32 - DNS2
//   ac_p - uint8  - active port (1-4)
//   ca_e - uint8  - CAT enabled (0/1)
//   ca_p - uint8  - CAT port (0-4)
//   ca_a - uint8  - CAT IC-705 address
//   ra_a  - uint8  - ESP32 address on CI-V bus
//   bt_p  - string - BLE pairing passkey
//   bd_X - uint32 - baud rate for port X (0-3)
//   ad_X - uint8  - CI-V address for port X (0-3)
#define NVS_VER 2

void load_cfg() {
  nvs.begin("civ-gw",false);
  cfg.bt_name=nvs.getString("bt_n","ESP32-CIV-GW");
  cfg.bt_pass=nvs.getString("bt_p","1234");
  cfg.ap_ssid=nvs.getString("ap_s","ESP32-CIV");
  cfg.ap_pass=nvs.getString("ap_p","12345678");
  cfg.sta_ssid=nvs.getString("st_s","");
  cfg.sta_pass=nvs.getString("st_p","");
  cfg.sta_dhcp=nvs.getBool("st_d",true);
  cfg.active_port=nvs.getUChar("ac_p",1);
  cfg.cat_enabled=nvs.getBool("ca_e",true);
  cfg.cat_port=nvs.getUChar("ca_p",0);
  cfg.cat_addr=nvs.getUChar("ca_a",0x98);
  cfg.radio_addr=nvs.getUChar("ra_a",0xE0);
  uint32_t ip=nvs.getULong("st_i",0),gw=nvs.getULong("st_g",0),sm=nvs.getULong("st_m",(uint32_t)IPAddress(255,255,255,0)),d1=nvs.getULong("st_1",(uint32_t)IPAddress(8,8,8,8)),d2=nvs.getULong("st_2",(uint32_t)IPAddress(8,8,4,4));
  if(ip)cfg.sta_ip=IPAddress(ip); if(gw)cfg.sta_gw=IPAddress(gw);
  cfg.sta_sn=IPAddress(sm); cfg.sta_d1=IPAddress(d1); cfg.sta_d2=IPAddress(d2);
  for(int i=0;i<4;i++){char k1[16],k2[16];snprintf(k1,16,"bd_%d",i);snprintf(k2,16,"ad_%d",i);cfg.civ_baud[i]=nvs.getULong(k1,DEFAULT_BAUD);cfg.civ_addr[i]=nvs.getUChar(k2,0x94);}
  // Inicializa endereco CI-V do IC-705
  civ_ic705_addr = cfg.cat_addr;
  // Carregar ultimo endereco do IC-705
  last_ic5_addr_str=nvs.getString("ic5a","");
  if(last_ic5_addr_str.length()>0){
    last_ic5_addr=new BLEAddress(last_ic5_addr_str.c_str());
    Serial.printf("[IC705] Ultimo endereco: %s\n",last_ic5_addr_str.c_str());
  }
  // Carregar lista de redes WiFi
  wifi_net_count=nvs.getUChar("wn_c",0);
  if(wifi_net_count>MAX_WIFI_NETS)wifi_net_count=MAX_WIFI_NETS;
  for(int i=0;i<wifi_net_count;i++){
    char ks[16],kp[16]; snprintf(ks,16,"wn_%d_s",i); snprintf(kp,16,"wn_%d_p",i);
    wifi_nets[i].ssid=nvs.getString(ks,""); wifi_nets[i].pass=nvs.getString(kp,"");
  }
  // Carregar preferencias de log
  uint8_t lp=nvs.getUChar("lp",0xFF);
  log_enabled.ble=lp&1; log_enabled.civ=(lp>>1)&1; log_enabled.ic5=(lp>>2)&1;
  log_enabled.wifi=(lp>>3)&1; log_enabled.sys=(lp>>4)&1; log_enabled.erro=(lp>>5)&1;
  // Carregar dispositivos Bluetooth salvos
  bt_device_count=nvs.getUChar("bc",0);
  if(bt_device_count>MAX_BT_DEVICES)bt_device_count=MAX_BT_DEVICES;
  for(int i=0;i<bt_device_count;i++){char kn[16],ka[16];snprintf(kn,16,"bn_%d",i);snprintf(ka,16,"ba_%d",i);bt_devices[i].name=nvs.getString(kn,"");bt_devices[i].addr=nvs.getString(ka,"");}
  // Carregar usuarios
  user_count=nvs.getUChar("uc",0);
  if(user_count>MAX_USERS)user_count=MAX_USERS;
  for(int i=0;i<user_count;i++){char kn[16],kp[16];snprintf(kn,16,"un_%d",i);snprintf(kp,16,"up_%d",i);String n=nvs.getString(kn,"");String p=nvs.getString(kp,"");strncpy(users[i].name,n.c_str(),19);strncpy(users[i].pass,p.c_str(),19);}
  if(user_count==0){strcpy(users[0].name,"admin");strcpy(users[0].pass,"1234");user_count=1;}
  nvs.putUChar("ver",NVS_VER);
  nvs.end();
}
void save_cfg() {
  nvs.begin("civ-gw",false);
  nvs.putUChar("ver",NVS_VER);
  nvs.putString("bt_n",cfg.bt_name); nvs.putString("bt_p",cfg.bt_pass);
  nvs.putString("ap_s",cfg.ap_ssid); nvs.putString("ap_p",cfg.ap_pass);
  nvs.putString("st_s",cfg.sta_ssid); nvs.putString("st_p",cfg.sta_pass); nvs.putBool("st_d",cfg.sta_dhcp);
  nvs.putUChar("ac_p",cfg.active_port);
  nvs.putBool("ca_e",cfg.cat_enabled); nvs.putUChar("ca_p",cfg.cat_port);
  nvs.putUChar("ca_a",cfg.cat_addr); nvs.putUChar("ra_a",cfg.radio_addr);
  nvs.putULong("st_i",(uint32_t)cfg.sta_ip); nvs.putULong("st_g",(uint32_t)cfg.sta_gw); nvs.putULong("st_m",(uint32_t)cfg.sta_sn); nvs.putULong("st_1",(uint32_t)cfg.sta_d1); nvs.putULong("st_2",(uint32_t)cfg.sta_d2);
  for(int i=0;i<4;i++){char k1[16],k2[16];snprintf(k1,16,"bd_%d",i);snprintf(k2,16,"ad_%d",i);nvs.putULong(k1,cfg.civ_baud[i]);nvs.putUChar(k2,cfg.civ_addr[i]);}
  // Salvar lista de redes WiFi
  nvs.putUChar("wn_c",(uint8_t)wifi_net_count);
  for(int i=0;i<wifi_net_count;i++){char ks[16],kp[16];snprintf(ks,16,"wn_%d_s",i);snprintf(kp,16,"wn_%d_p",i);nvs.putString(ks,wifi_nets[i].ssid);nvs.putString(kp,wifi_nets[i].pass);}
  // Salvar preferencias de log
  // Salvar usuarios
  nvs.putUChar("uc",(uint8_t)user_count);
  for(int i=0;i<user_count;i++){char kn[16],kp[16];snprintf(kn,16,"un_%d",i);snprintf(kp,16,"up_%d",i);nvs.putString(kn,users[i].name);nvs.putString(kp,users[i].pass);}
  uint8_t lp=(log_enabled.ble?1:0)|(log_enabled.civ?2:0)|(log_enabled.ic5?4:0)|(log_enabled.wifi?8:0)|(log_enabled.sys?16:0)|(log_enabled.erro?32:0);
  nvs.putUChar("lp",lp);
  // Salvar dispositivos Bluetooth
  nvs.putUChar("bc",(uint8_t)bt_device_count);
  for(int i=0;i<bt_device_count;i++){char kn[16],ka[16];snprintf(kn,16,"bn_%d",i);snprintf(ka,16,"ba_%d",i);nvs.putString(kn,bt_devices[i].name);nvs.putString(ka,bt_devices[i].addr);}
  nvs.end();
}

void save_wifi_nets() {
  nvs.begin("civ-gw",false);
  nvs.putUChar("wn_c",(uint8_t)wifi_net_count);
  for(int i=0;i<wifi_net_count;i++){char ks[16],kp[16];snprintf(ks,16,"wn_%d_s",i);snprintf(kp,16,"wn_%d_p",i);nvs.putString(ks,wifi_nets[i].ssid);nvs.putString(kp,wifi_nets[i].pass);}
  nvs.end();
}

void save_bt_devices() {
  nvs.begin("civ-gw",false);
  nvs.putUChar("bc",(uint8_t)bt_device_count);
  for(int i=0;i<bt_device_count;i++){char kn[16],ka[16];snprintf(kn,16,"bn_%d",i);snprintf(ka,16,"ba_%d",i);nvs.putString(kn,bt_devices[i].name);nvs.putString(ka,bt_devices[i].addr);}
  nvs.end();
}

HardwareSerial* gp(uint8_t p) { switch(p){case 1:return&p1;case 2:return&p2;case 3:return&p3;default:return NULL;} }

// ===================== BLE SETUP =====================
void setup_nus() {
  addLog("SYS","Inicializando BLE...");
  Serial.println("[BLE] Inicializando BLE...");

  // Libera memoria do Classic BT (nao usado no S3)
  esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT);

  // Inicializa BLE
  if(!BLEDevice::init(cfg.bt_name.c_str())){
    addLog("ERRO","BLE init falhou!");
    Serial.println("[BLE] ERRO: BLEDevice::init() falhou!");
    return;
  }
  addLog("BLE","MAC: %s",BLEDevice::getAddress().toString().c_str());
  Serial.printf("[BLE] OK - MAC: %s\n", BLEDevice::getAddress().toString().c_str());

  // Cria servidor NUS
  nuss=BLEDevice::createServer();
  if(!nuss){Serial.println("[BLE] ERRO: createServer falhou"); return;}
  nuss->setCallbacks(new NSCB());

  auto svc=nuss->createService(NUS_SVC);
  nustx=svc->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  nustx->addDescriptor(new BLE2902());
  nusrx=svc->createCharacteristic(NUS_RX, BLECharacteristic::PROPERTY_WRITE);
  nusrx->setCallbacks(new NRCB());
  svc->start();

  // Advertising completo
  auto adv=BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SVC);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] '%s' anunciando!\n", cfg.bt_name.c_str());
  Serial.println("[BLE] Use um app como 'nRF Connect' ou 'BLE Scanner' para verificar.");
}

void scan_ic5() {
  if(ic5con||ic5docon)return;
  Serial.println("[IC705] Escaneando IC-705 por 4s...");

  // Para advertising temporariamente
  auto ad=BLEDevice::getAdvertising();
  if(ad) ad->stop();

  auto sc=BLEDevice::getScan(); sc->setAdvertisedDeviceCallbacks(new IC5AdvCB()); sc->setInterval(1349); sc->setWindow(449); sc->setActiveScan(true);
  sc->start(4,false);
  sc->clearResults();

  // Retoma advertising
  delay(100);
  if(ad) ad->start();
  BLEDevice::startAdvertising();
  Serial.println("[IC705] Scan concluido, advertising retomado");
}

void conn_ic5(BLEAddress a) {
  Serial.printf("[IC705] Conectando %s...\n",a.toString().c_str());
  ic5cli=BLEDevice::createClient(); ic5cli->setClientCallbacks(new ICCB());
  if(!ic5cli->connect(a)){Serial.println("[IC705] Falha connect"); ic5cli=nullptr; return;}
  ic5cli->setMTU(517);

  auto svc=ic5cli->getService(BLEUUID(IC705_SVC));
  if(!svc){Serial.println("[IC705] Sem servico"); ic5cli->disconnect(); return;}
  ic5ch=svc->getCharacteristic(BLEUUID(IC705_CHAR));
  if(!ic5ch){Serial.println("[IC705] Sem caracteristica"); ic5cli->disconnect(); return;}

  // Habilita NOTIFICACOES explicitamente via descriptor 0x2902
  Serial.println("[IC705] Ativando notificacoes...");
  const uint8_t on[2]={0x01,0x00};
  auto desc=ic5ch->getDescriptor(BLEUUID((uint16_t)0x2902));
  if(desc){desc->writeValue((uint8_t*)on,2,true); Serial.println("[IC705] Notificacoes ativadas");}
  else Serial.println("[IC705] Sem descriptor 0x2902");

  // Registra callback
  ic5ch->registerForNotify(ic5cb);

  // Diagnostico: listar caracteristicas do servico IC-705
  Serial.printf("[IC705] Servico: %s\n",svc->getUUID().toString().c_str());
  auto charMap=svc->getCharacteristics(); // retorna ponteiro
  if(charMap){
    int ci=0;
    for(auto it=charMap->begin();it!=charMap->end();++it){
      BLERemoteCharacteristic* ch=it->second;
      ci++;
      Serial.printf("[IC705] Char%d: UUID=%s R=%d W=%d N=%d\n",
        ci, ch->getUUID().toString().c_str(), ch->canRead(), ch->canWrite(), ch->canNotify());
    }
  }

  // Salva endereco para reconexao futura
  last_ic5_addr_str=a.toString();
  last_ic5_addr=new BLEAddress(a);
  nvs.begin("civ-gw",false);
  nvs.putString("ic5a",last_ic5_addr_str);
  nvs.end();
  Serial.printf("[IC705] Endereco salvo: %s\n",last_ic5_addr_str.c_str());

  // Handshake IMEDIATO
  Serial.println("[IC705] Conectado! Enviando handshake...");
  pair_ic5();
}

void pair_ic5() {
  if(!ic5ch||!ic5cli->isConnected()){Serial.println("[IC705] Desconectado antes do handshake"); return;}

  // UUID 41 bytes
  uint8_t m1[]={0xFE,0xF1,0x00,0x61,0x35,0x36,0x41,0x35,0x36,0x37,0x33,0x30,0x2D,0x45,0x38,0x42,0x43,0x2D,0x34,0x39,0x33,0x30,0x2D,0x38,0x31,0x42,0x36,0x2D,0x45,0x46,0x33,0x33,0x45,0x39,0x37,0x33,0x38,0x34,0x32,0x42,0xFD};
  ic5ch->writeValue(m1,sizeof(m1));
  if(!ic5cli->isConnected()){Serial.println("[IC705] Desconectado apos UUID"); return;}

  // Nome 21 bytes
  uint8_t m2[]={0xFE,0xF1,0x00,0x62,0x49,0x43,0x37,0x30,0x35,0x2D,0x47,0x61,0x74,0x65,0x77,0x61,0x79,0x2D,0x30,0x31,0xFD};
  ic5ch->writeValue(m2,sizeof(m2));
  if(!ic5cli->isConnected()){Serial.println("[IC705] Desconectado apos Nome"); return;}

  // Token 9 bytes
  uint8_t m3[]={0xFE,0xF1,0x00,0x63,0xEE,0x39,0x09,0x10,0xFD};
  ic5ch->writeValue(m3,sizeof(m3));
  if(!ic5cli->isConnected()){Serial.println("[IC705] Desconectado apos Token"); return;}

  // NOTA: Echo Back e Transceive serao ativados apos receber CI-V grant (no loop)
  Serial.println("[IC705] Handshake enviado. Aguardando CI-V grant...");
}

void send_civ(uint8_t* d, int l) {
  if(!ic5con||!ic5civ||!ic5ch){Serial.printf("[CIV] send: ic5con=%d ic5civ=%d ch=%p\n",ic5con,ic5civ,ic5ch); return;}
  if(!ic5cli||!ic5cli->isConnected()){Serial.printf("[CIV] send: cliente desconectado\n"); return;}
  if(log_enabled.civ){
    Serial.printf("[CIV] Enviando: ");
    for(int i=0;i<l;i++) Serial.printf("%02X ",d[i]);
    Serial.println("");
  }
  ic5ch->writeValue(d,l,true);
  if(ic5ch->canRead()){
    String resp=ic5ch->readValue();
    if(resp.length()>0){
      Serial.printf("[CIV_READ] Resposta: %d bytes\n",resp.length());
      if(!rxrdy && resp.length()<=RXBUF){
        memcpy(rxbuf,(uint8_t*)resp.c_str(),resp.length()); rxlen=resp.length(); rxrdy=true;
      }
    }
  }
}

// ===================== CI-V BCD FREQ =====================
uint64_t bcd_freq(uint8_t* d, int off, int n) {
  uint64_t f=0;
  uint64_t mul[]={1000000000ULL,100000000ULL,10000000ULL,1000000ULL,100000ULL,10000ULL,1000ULL,100ULL,10ULL,1ULL};
  for(int i=0;i<n;i++){
    int idx=off+n-1-i;
    f+=((d[idx]>>4)&0x0F)*mul[i*2];
    f+=(d[idx]&0x0F)*mul[i*2+1];
  }
  return f;
}
void freq_bcd(uint64_t f, uint8_t* d, int off) {
  // 5 bytes BCD para RESPOSTA: d[off]=MSB [1GHz][100MHz], d[off+4]=LSB [10Hz][1Hz]
  for(int i=4;i>=0;i--){
    d[off+i]=(((f%100)/10)<<4)|(f%10);
    f/=100;
  }
}
void freq_bcd_lsb(uint64_t f, uint8_t* d, int off) {
  // 5 bytes BCD para COMANDO: d[off]=LSB [10Hz][1Hz], d[off+4]=MSB [1GHz][100MHz]
  for(int i=0;i<5;i++){
    d[off+i]=(((f%100)/10)<<4)|(f%10);
    f/=100;
  }
}

// ===================== CI-V COMMANDS =====================
void poll_ic5() {
  if(!ic5con||!ic5civ) return;
  unsigned long now=millis();
  // Polling mais lento (2s) para nao sobrecarregar
  if(now-last_poll>=1000) {
    uint8_t cmd[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_F_READ,CIV_END};
    send_civ(cmd,sizeof(cmd)); last_poll=now;
  }
  // S-meter a cada 1000ms (junto com frequencia)
  if(now-last_smeter>=1000) {
    uint8_t cmd[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_SMETER,0x02,CIV_END};
    send_civ(cmd,sizeof(cmd)); last_smeter=now;
  }
  if(pending_cmd) { send_civ(pending_buf,pending_len); pending_cmd=false; }
}

void set_freq(uint64_t f) {
  Serial.printf("[CMD] set_freq chamado com %llu\n",f);
  uint8_t d[13]; int i=0;
  d[i++]=CIV_PRE; d[i++]=CIV_PRE; d[i++]=civ_ic705_addr; d[i++]=CIV_CTRL; d[i++]=0x00;
  freq_bcd_lsb(f,d,i); i+=5;
  d[i++]=CIV_END;
  send_civ(d,i);
  Serial.printf("[CI-V] Frequencia: %llu\n", f);
  ic5_freq=f;
}

void set_mode(uint8_t m) {
  // FE FE 98 E0 06 <mode> <filter> FD
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_M_SET,m,0x01,CIV_END};
  send_civ(d,sizeof(d));
  ic5_mode=m;
  if(m<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[m][0]) strcpy(ic5_mode_str,mode_names[m]);
  else snprintf(ic5_mode_str,8,"M%02X",m);
  Serial.printf("[CI-V] Modo: %s\n", ic5_mode_str);
}

void set_ptt(bool on) {
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_PTT_ON,on?0x01:0x00,CIV_END};
  send_civ(d,sizeof(d));
  ic5_ptt=on;
  Serial.printf("[CI-V] PTT: %s\n", on?"TX":"RX");
}

void set_pwr(bool on) {
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,on?C_PWR_ON:C_PWR_OFF,on?0x01:0x00,CIV_END};
  send_civ(d,sizeof(d));
  ic5_pwr=on;
  Serial.printf("[CI-V] Power: %s\n", on?"ON":"OFF");
}

void set_agc(uint8_t v) {
  // FE FE 98 E0 16 21 <0=OFF 1=FAST 2=MID 3=SLOW> FD
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_AGC_SET,0x21,v,CIV_END};
  send_civ(d,sizeof(d)); ic5_agc=v;
  const char* n[]={"OFF","FAST","MID","SLOW"}; Serial.printf("[CI-V] AGC: %s\n", v<4?n[v]:"?");
}

void set_pre(uint8_t v) {
  // FE FE 98 E0 16 20 <0=OFF 1=ON1 2=ON2> FD
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_PRE_ON,0x20,v,CIV_END};
  send_civ(d,sizeof(d)); ic5_pre=v;
  const char* n[]={"OFF","ON1","ON2"}; Serial.printf("[CI-V] PRE: %s\n", v<3?n[v]:"?");
}

void set_att(uint8_t v) {
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_ATT_ON,0x11,v,CIV_END};
  send_civ(d,sizeof(d)); ic5_att=v;
  Serial.printf("[CI-V] ATT: %s\n", v?"ON":"OFF");
}

void set_rf(uint8_t v) {
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_RF_SET,0x12,v,CIV_END};
  send_civ(d,sizeof(d)); ic5_rf=v;
  Serial.printf("[CI-V] RF Gain: %u\n", v);
}

void set_af(uint8_t v) {
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_AF_SET,0x14,v,CIV_END};
  send_civ(d,sizeof(d)); ic5_af=v;
  Serial.printf("[CI-V] AF Gain: %u\n", v);
}

void set_split(bool on) {
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,on?C_SPLIT_ON:C_SPLIT_OFF,on?0x01:0x00,CIV_END};
  send_civ(d,sizeof(d)); ic5_split=on;
  Serial.printf("[CI-V] Split: %s\n", on?"ON":"OFF");
}

// ===================== CI-V PARSER =====================
void parse_civ(uint8_t* d, int l) {
  if(l<5||d[0]!=CIV_PRE||d[1]!=CIV_PRE) return;
  // No CI-V, resposta mantem ordem: <dest_original> <src_original>
  // Resposta do IC-705: FE FE E0 A4 <cmd> <data> FD
  // Onde E0=nosso endereco, A4=endereco do radio
  if(d[2]!=CIV_CTRL && d[3]!=CIV_CTRL) return; // ignora se nao for pra nos
  if(d[2]!=civ_ic705_addr && d[3]!=civ_ic705_addr) return; // ignora se nao for do radio

  uint8_t cmd=d[4];
  // FE FE E0 A4 03 <5 bytes freq> FD
  if(cmd==C_F_READ&&l>=11&&d[l-1]==CIV_END) {
    ic5_freq=bcd_freq(d,5,5);
    Serial.printf("[CI-V] Freq: %llu Hz\n", ic5_freq);
  }
  // FE FE 98 E0 04 <mode> <filt> FD
  else if(cmd==C_M_READ&&l>=7) {
    ic5_mode=d[5]; ic5_filt=d[6];
    if(ic5_mode<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[ic5_mode][0]) strcpy(ic5_mode_str,mode_names[ic5_mode]);
    else snprintf(ic5_mode_str,8,"M%02X",ic5_mode);
    Serial.printf("[CI-V] Modo: %s Filt:%u\n", ic5_mode_str, ic5_filt);
  }
  // FE FE 98 E0 1C <00=RX 01=TX> FD
  else if(cmd==C_PTT_READ&&l>=6) {
    ic5_ptt=d[5]; Serial.printf("[CI-V] PTT: %s\n", ic5_ptt?"TX":"RX");
  }
  // S-meter: FE FE E0 A4 15 02 <byte1> <byte2> FD
  else if(cmd==C_SMETER&&l>=7&&d[5]==0x02) {
    ic5_smeter=(l>=8)?d[7]:d[6]; // alguns radios usam o 2o byte
    if(ic5_smeter>100) ic5_smeter=d[6]; // fallback
  }
  // Power: FE FE 98 E0 1A 05 <0=OFF 1=ON> FD
  else if(cmd==0x1A&&l>=7&&d[5]==0x05) {
    ic5_pwr=d[6];
  }
  // AGC: FE FE 98 E0 16 21 <v> FD
  else if(cmd==C_AGC_SET&&l>=7&&d[5]==0x21) {
    ic5_agc=d[6];
  }
  // PRE: FE FE 98 E0 16 20 <v> FD
  else if(cmd==C_PRE_ON&&l>=7&&d[5]==0x20) {
    ic5_pre=d[6];
  }
  // ATT: FE FE 98 E0 11 11 <v> FD
  else if(cmd==C_ATT_ON&&l>=7&&d[5]==0x11) {
    ic5_att=d[6];
  }
}

void proc_ic5() {
  if(!rxrdy) return;
  if(log_enabled.civ){
    Serial.printf("[CIV] Recebido: ");
    for(int i=0;i<rxlen;i++) Serial.printf("%02X ",rxbuf[i]);
    Serial.println("");
  }
  parse_civ(rxbuf,rxlen);
  rxrdy=false;
}

// ===================== BRIDGES =====================
void bridge_ic5p() {
  if(!ic5con||!ic5civ||!rxrdy||!cfg.cat_enabled) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  auto dp=gp(p);
  if(dp&&p!=4){ for(int i=0;i<rxlen;i++) dp->write(rxbuf[i]); }
  rxrdy=false;
}
void bridge_pic5() {
  if(!ic5con||!ic5civ) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  auto sp=gp(p);
  if(!sp||p==4||!sp->available()) return;
  uint8_t b[128]; int l=0;
  while(sp->available()&&l<128) b[l++]=sp->read();
  if(l>0&&ic5ch) ic5ch->writeValue(b,l);
}
void bridge_nusp() {
  if(!nuscon||!nuslen) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  auto dp=gp(p);
  if(dp&&p!=4){ for(int i=0;i<nuslen;i++) dp->write(nusbuf[i]); }
  nuslen=0;
}
void bridge_pnus() {
  if(!nuscon||!nustx) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  auto sp=gp(p);
  if(!sp||p==4||!sp->available()) return;
  uint8_t b[128]; int l=0;
  while(sp->available()&&l<128) b[l++]=sp->read();
  if(l>0){ nustx->setValue(b,l); nustx->notify(); }
}

// ===================== WIFI =====================
void setup_ap() {
  WiFi.mode(WIFI_AP_STA); WiFi.softAP(cfg.ap_ssid.c_str(),cfg.ap_pass.c_str()); delay(500);
  Serial.printf("[WiFi] AP: %s / %s\n",cfg.ap_ssid.c_str(),WiFi.softAPIP().toString().c_str());
}
void setup_sta() {
  addLog("WiFi","Conectando...");
  if(wifi_net_count>0) {
    wifi_net_current=0;
    wifi_connecting=true;
    wifi_conn_start=millis();
    if(!cfg.sta_dhcp) WiFi.config(cfg.sta_ip,cfg.sta_gw,cfg.sta_sn,cfg.sta_d1,cfg.sta_d2);
    Serial.printf("[WiFi] Tentando rede 1/%d: '%s'...\n",wifi_net_count,wifi_nets[0].ssid.c_str());
    WiFi.begin(wifi_nets[0].ssid.c_str(),wifi_nets[0].pass.c_str());
    return;
  }
  // Fallback: config unica
  if(cfg.sta_ssid.length()==0){sta_con=false;return;}
  wifi_net_current=0;
  wifi_connecting=true;
  wifi_conn_start=millis();
  if(!cfg.sta_dhcp) WiFi.config(cfg.sta_ip,cfg.sta_gw,cfg.sta_sn,cfg.sta_d1,cfg.sta_d2);
  Serial.printf("[WiFi] Conectando '%s'...\n",cfg.sta_ssid.c_str());
  WiFi.begin(cfg.sta_ssid.c_str(),cfg.sta_pass.c_str());
}

void wifi_conn_tick() {
  if(!wifi_connecting) return;
  // WiFi conectou
  if(WiFi.status()==WL_CONNECTED) {
    wifi_connecting=false;
    wifi_net_current=-1;
    sta_con=true;
    addLog("WiFi","Conectado! IP: %s",WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] Conectado! IP: %s\n",WiFi.localIP().toString().c_str());
    return;
  }
  // Timeout: tentar proxima rede
  if(millis()-wifi_conn_start>=WIFI_CLIENT_TIMEOUT) {
    wifi_net_current++;
    if(wifi_net_current<wifi_net_count) {
      wifi_conn_start=millis();
      if(!cfg.sta_dhcp) WiFi.config(cfg.sta_ip,cfg.sta_gw,cfg.sta_sn,cfg.sta_d1,cfg.sta_d2);
      WiFi.begin(wifi_nets[wifi_net_current].ssid.c_str(),wifi_nets[wifi_net_current].pass.c_str());
      Serial.printf("[WiFi] Tentando rede %d/%d: '%s'...\n",wifi_net_current+1,wifi_net_count,wifi_nets[wifi_net_current].ssid.c_str());
    } else {
      wifi_connecting=false;
      wifi_net_current=-1;
      sta_con=false;
      if(wifi_net_count>0) Serial.println("[WiFi] Todas as redes falharam");
      else Serial.println("[WiFi] Falha ao conectar");
    }
  }
}
void wifi_scan() {
  if(scan_busy)return; scan_busy=true; scan_n=0; scan_json="[]";
  auto n=WiFi.scanComplete(); if(n!=WIFI_SCAN_FAILED)WiFi.scanDelete(); WiFi.scanNetworks(true);
}
void wifi_chk() {
  if(!scan_busy)return;
  int n=WiFi.scanComplete();
  if(n==WIFI_SCAN_FAILED||n==WIFI_SCAN_RUNNING){if(n==WIFI_SCAN_FAILED){scan_busy=false;scan_json="[]";}return;}
  scan_busy=false; scan_n=n;
  StaticJsonDocument<4096> d; JsonArray a=d.to<JsonArray>();
  for(int i=0;i<n;i++){JsonObject o=a.createNestedObject();o["ssid"]=WiFi.SSID(i);o["rssi"]=WiFi.RSSI(i);int s=0;int r=WiFi.RSSI(i);if(r>-50)s=4;else if(r>-65)s=3;else if(r>-80)s=2;else if(r>-90)s=1;o["bars"]=s;o["open"]=(WiFi.encryptionType(i)==WIFI_AUTH_OPEN);}
  scan_json=""; serializeJson(d,scan_json); WiFi.scanDelete();
}

// ===================== PORTAS =====================
void sel_port(uint8_t p) {
  if(p<1||p>4)return;
  cfg.active_port=p;
  switch(p){case 1:act_civ=&p1;break;case 2:act_civ=&p2;break;case 3:act_civ=&p3;break;}
  Serial.printf("[CI-V] Porta: PORT %d\n",p);
}
void rst_port(uint8_t p) {
  switch(p){case 1:p1.end();p1.begin(cfg.civ_baud[0],SERIAL_8N1,PORT1_RX,PORT1_TX);break;case 2:p2.end();p2.begin(cfg.civ_baud[1],SERIAL_8N1,PORT2_RX,PORT2_TX);break;case 3:p3.end();p3.begin(cfg.civ_baud[2],SERIAL_8N1,PORT3_RX,PORT3_TX);break;}
}

// ===================== SERIAL COMMANDS =====================
void serial_cmd() {
  if(!Serial.available())return;
  String c=Serial.readStringUntil('\n'); c.trim();
  if(c=="help"){
    Serial.println("=== CMD ===");
    Serial.println("help,sts,cfg,ports,scan,ic5con,ic5disc");
    Serial.println("freq <Hz>,mode <0-35>,ptt <0|1>,pwr <0|1>");
    Serial.println("agc <0-3>,pre <0-2>,att <0|1>,rfg <0-255>,afg <0-255>");
    Serial.println("split <0|1>,selport <1-4>,set_bt <N>,set_baud <N> <B>");
    Serial.println("set_addr <N> <HEX>,reboot,factory");
  } else if(c=="sts"||c=="status"){
    Serial.printf("IC705: %s CI-V:%s Freq:%llu Mode:%s PTT:%s PWR:%s\n",ic5con?"CON":"---",ic5civ?"OK":"---",ic5_freq,ic5_mode_str,ic5_ptt?"TX":"RX",ic5_pwr?"ON":"OFF");
    Serial.printf("AGC:%u PRE:%u ATT:%u RF:%u AF:%u S:%u Split:%u\n",ic5_agc,ic5_pre,ic5_att,ic5_rf,ic5_af,ic5_smeter,ic5_split);
    Serial.printf("AP: %s (%s) STA: %s\n",cfg.ap_ssid.c_str(),WiFi.softAPIP().toString().c_str(),sta_con?("CON "+WiFi.localIP().toString()).c_str():"---");
  } else if(c=="cfg"||c=="config"){
    Serial.printf("AP:%s STA:%s DHCP:%s BLE:%s CAT:%s Porta:%d\n",cfg.ap_ssid.c_str(),cfg.sta_ssid.c_str(),cfg.sta_dhcp?"S":"N",cfg.bt_name.c_str(),cfg.cat_enabled?"S":"N",cfg.cat_port);
    for(int i=0;i<4;i++)Serial.printf("PORT%d: Baud=%u Addr=0x%02X\n",i+1,cfg.civ_baud[i],cfg.civ_addr[i]);
  } else if(c=="ports"){
    Serial.println("PORT1: RX16 TX17\nPORT2: RX18 TX19\nPORT3: RX20 TX21\nPORT4: RX14 TX15");
  } else if(c=="scan"){wifi_scan();Serial.println("[WiFi] Scan");delay(3000);wifi_chk();}
  else if(c=="ic5con"){scan_ic5();}
  else if(c=="ic5disc"){if(ic5cli)ic5cli->disconnect();}
  else if(c.startsWith("freq ")){uint64_t f=atoll(c.substring(5).c_str());if(f>100000)set_freq(f);}
  else if(c.startsWith("mode ")){uint8_t m=(uint8_t)atoi(c.substring(5).c_str());set_mode(m);}
  else if(c.startsWith("ptt ")){set_ptt(atoi(c.substring(4).c_str())==1);}
  else if(c.startsWith("pwr ")){set_pwr(atoi(c.substring(4).c_str())==1);}
  else if(c.startsWith("agc ")){set_agc((uint8_t)atoi(c.substring(4).c_str()));}
  else if(c.startsWith("pre ")){set_pre((uint8_t)atoi(c.substring(4).c_str()));}
  else if(c.startsWith("att ")){set_att((uint8_t)atoi(c.substring(4).c_str()));}
  else if(c.startsWith("rfg ")){set_rf((uint8_t)atoi(c.substring(4).c_str()));}
  else if(c.startsWith("afg ")){set_af((uint8_t)atoi(c.substring(4).c_str()));}
  else if(c.startsWith("split ")){set_split(atoi(c.substring(6).c_str())==1);}
  else if(c.startsWith("selport ")||c.startsWith("select_port ")){int i=c.lastIndexOf(' ');sel_port((uint8_t)atoi(c.substring(i+1).c_str()));save_cfg();}
  else if(c.startsWith("set_bt ")){cfg.bt_name=c.substring(7);save_cfg();Serial.printf("[BLE] %s\n",cfg.bt_name.c_str());}
  else if(c.startsWith("set_baud ")){
    int s=c.indexOf(' ',9);if(s>0){int p=atoi(c.substring(9,s).c_str());uint32_t b=atol(c.substring(s+1).c_str());if(p>=1&&p<=4){cfg.civ_baud[p-1]=b;save_cfg();if(p==cfg.active_port)rst_port(p);}}
  } else if(c.startsWith("set_addr ")){
    int s=c.indexOf(' ',9);if(s>0){int p=atoi(c.substring(9,s).c_str());String a=c.substring(s+1);if(p>=1&&p<=4){cfg.civ_addr[p-1]=(uint8_t)strtol(a.c_str(),NULL,16);save_cfg();}}
  } else if(c=="reboot"){Serial.println("Reboot");delay(500);ESP.restart();}
  else if(c=="factory"){nvs.begin("civ-gw",false);nvs.clear();nvs.end();Serial.println("Factory reset");}
}

// ===================== WEB =====================
void setup_ws() {
  srv.on("/",HTTP_GET,h_root);
  srv.on("/api/config",HTTP_GET,h_cfg);
  srv.on("/api/status",HTTP_GET,h_sts);
  srv.on("/api/scan",HTTP_GET,h_scan);
  srv.on("/api/wifi_nets",HTTP_GET,h_wifi_nets);
  srv.on("/api/ble_scan",HTTP_GET,h_ble_scan);
  srv.on("/api/bt_devices",HTTP_GET,h_bt_devices);
  srv.on("/api/login",HTTP_POST,h_login);
  srv.on("/api/logout",HTTP_GET,h_logout);
  srv.on("/api/update",HTTP_POST,[](){
    if(!checkAuth()){srv.send(401,"","");return;}
    HTTPUpload& upload=srv.upload();
    if(upload.status==UPLOAD_FILE_START){
      Serial.printf("[UPDATE] Iniciando: %s (%d bytes)\n",upload.filename.c_str(),upload.totalSize);
      if(!Update.begin(upload.totalSize>0?upload.totalSize:UPDATE_SIZE_UNKNOWN)){Update.printError(Serial);}
    } else if(upload.status==UPLOAD_FILE_WRITE){
      if(Update.write(upload.buf,upload.currentSize)!=upload.currentSize){Update.printError(Serial);}
    } else if(upload.status==UPLOAD_FILE_END){
      if(Update.end(true)){Serial.printf("[UPDATE] Sucesso! %d bytes. Reiniciando...\n",upload.totalSize);srv.send(200,"text/plain","OK");delay(1000);ESP.restart();}
      else{Update.printError(Serial);srv.send(500,"text/plain","Falha");}
    }
  });
  srv.on("/login",HTTP_GET,h_login_page);
  srv.on("/api/logs",HTTP_GET,h_logs);
  srv.on("/api/save",HTTP_GET,h_save);
  srv.on("/api/save",HTTP_POST,h_save);
  srv.on("/api/civ",HTTP_POST,h_civ_cmd);
  srv.onNotFound(h_404);
  srv.begin();
  Serial.printf("[HTTP] http://%s/\n",WiFi.softAPIP().toString().c_str());
}

void h_root() {
  if(!checkAuth()){srv.sendHeader("Location","/login");srv.send(302,"text/plain","");return;}
  String h=R"rawliteral(
<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>ESP32 CI-V Gateway</title>
<link href="https://fonts.cdnfonts.com/css/ds-digital" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#0d1b2a;color:#e2e8f0;padding:12px;max-width:1000px;margin:0 auto}
h1{color:#4fc3f7;font-size:20px;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid rgba(79,195,247,0.3);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h2{color:#FFB300;font-size:14px;margin:10px 0 6px}
.card{background:#0a1118;border:1px solid rgba(79,195,247,0.2);border-radius:4px;padding:10px;margin-bottom:8px}
label{color:#94a3b8;font-size:11px;display:block;margin:5px 0 2px}
input,select{width:100%;padding:5px 6px;background:#1a2a3a;border:1px solid rgba(79,195,247,0.3);border-radius:3px;color:#e2e8f0;font-size:12px;outline:none}
input:focus,select:focus{border-color:#4fc3f7}
button{padding:6px 14px;background:#4fc3f7;color:#0d1b2a;border:none;border-radius:3px;font-weight:bold;font-size:12px;cursor:pointer;margin:4px 2px}
button:hover{background:#80d8ff}
.btn-sm{padding:4px 8px;font-size:10px}
.btn-outline{background:transparent;border:1px solid #4fc3f7;color:#4fc3f7}
.btn-outline:hover{background:rgba(79,195,247,.15)}
.btn-red{background:#ef4444}
.btn-red:hover{background:#f87171}
.btn-green{background:#10b981}
.btn-green:hover{background:#34d399}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
.gitem{background:#1a2a3a;padding:5px 7px;border-radius:3px}
.glabel{color:#94a3b8;font-size:9px;text-transform:uppercase}
.gval{color:#4fc3f7;font-size:14px;font-weight:bold}
.gval.tx{color:#ef4444}
.badge{display:inline-block;padding:1px 5px;border-radius:2px;font-size:9px;font-weight:bold}
.bg-green{background:rgba(16,185,129,.2);color:#10b981}
.bg-red{background:rgba(239,68,68,.2);color:#ef4444}
.bg-blue{background:rgba(79,195,247,.2);color:#4fc3f7}
.tabs{display:flex;gap:2px;margin-bottom:8px;flex-wrap:wrap}
.tab{padding:5px 10px;background:#1a2a3a;border:1px solid rgba(79,195,247,0.2);border-radius:3px;color:#94a3b8;cursor:pointer;font-size:11px}
.tab.active{background:rgba(79,195,247,0.2);color:#4fc3f7;border-color:#4fc3f7}
.tab:hover{color:#4fc3f7}
.freq{font-size:28px;font-weight:bold;color:#4fc3f7;font-family:'DS-Digital',monospace;text-align:center;padding:10px;letter-spacing:2px;text-shadow:0 0 8px rgba(79,195,247,0.3)}
.toast{position:fixed;bottom:10px;right:10px;left:10px;padding:8px 12px;border-radius:3px;color:#fff;display:none;z-index:999;font-size:12px;text-align:center;max-width:400px;margin:0 auto}
.toast.ok{background:#10b981;display:block}
.toast.err{background:#ef4444;display:block}
.toast.info{background:#3b82f6;display:block}
.slider{width:100%;margin:4px 0}
.slider-val{color:#4fc3f7;font-size:11px;text-align:right}
</style></head><body>
<h1>&#9881; ESP32 CI-V Gateway <span style="font-size:12px;color:#94a3b8">v1.0.1</span></h1>
<div class="tabs" id="tabbar">
<button class="tab active" data-tab="radio" onclick="st(this)">Radio</button>
<button class="tab" data-tab="ic705" onclick="st(this)">IC-705</button>
<button class="tab" data-tab="wifi" onclick="st(this)">WiFi</button>
<button class="tab" data-tab="bluetooth" onclick="st(this)">Bluetooth</button>
<button class="tab" data-tab="civ" onclick="st(this)">CI-V</button>
<button class="tab" data-tab="logs" onclick="st(this)">Logs</button>
<button class="tab" data-tab="admin" onclick="st(this)">Admin</button>
</div>

<div id="tb-radio">
<h2>Painel de Controle IC-705</h2>
<div class="card">
<div class="grid">
<div class="gitem"><div class="glabel">Frequencia</div><div class="gval freq" id="v_freq">---</div></div>
<div class="gitem"><div class="glabel">Modo</div><div class="gval" id="v_mode">---</div></div>
<div style="display:flex;gap:4px;flex:1">
<div class="gitem" style="flex:0.3;display:flex;flex-direction:column;justify-content:center"><div class="glabel">PTT</div><div class="gval" id="v_ptt"><span class="badge bg-red">RX</span></div></div>
<div class="gitem" style="flex:0.7">
<div class="glabel">S-Meter</div>
<div id="sdigital" style="background:#0a1118;border:1px solid rgba(79,195,247,0.2);border-radius:4px;padding:6px;text-align:center">
<div style="display:flex;justify-content:space-between;align-items:baseline">
<span style="font-size:24px;font-weight:bold;color:#4fc3f7;font-family:'DS-Digital',monospace" id="stxt">--</span>
<span style="font-size:12px;color:#94a3b8;font-family:monospace" id="stxt2">--- dBm</span>
</div>
<div style="height:6px;background:#1a2a3a;border-radius:3px;margin-top:4px"><div id="sbar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#4fc3f7,#FFB300,#ef4444);border-radius:3px;transition:width .2s"></div></div>
<div style="display:flex;justify-content:space-between;font-size:8px;color:#555;margin-top:2px">
<span>S0</span><span>S3</span><span>S6</span><span>S9</span><span>+20</span><span>+40</span><span>+60</span>
</div>
</div>
</div>
</div>
<div class="gitem"><div class="glabel">Power</div><div class="gval" id="v_pwr"><span class="badge bg-green">ON</span></div></div>
<div class="gitem"><div class="glabel">Split</div><div class="gval" id="v_split"><span class="badge bg-red">OFF</span></div></div>
<div class="gitem"><div class="glabel">AGC</div><div class="gval" id="v_agc">---</div></div>
<div class="gitem"><div class="glabel">PRE/ATT</div><div class="gval" id="v_pre">---</div></div>
</div>
</div>

<div class="card">
<h2>Controles</h2>
<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
<button class="btn-green btn-sm" onclick="civ('ptt',1)">PTT ON</button>
<button class="btn-red btn-sm" onclick="civ('ptt',0)">PTT OFF</button>
<button class="btn-outline btn-sm" onclick="civ('pwr',0)">Desligar</button>
<button class="btn-outline btn-sm" onclick="civ('pwr',1)">Ligar</button>
</div>

<div style="display:flex;gap:4px;flex-wrap:wrap">
<span style="color:#94a3b8;font-size:10px;line-height:24px">Banda:</span>
<button class="btn-sm" onclick="civ('freq','28000000')">10m</button>
<button class="btn-sm" onclick="civ('freq','144000000')">2m</button>
<button class="btn-sm" onclick="civ('freq','430000000')">70cm</button>
<button class="btn-sm" onclick="civ('freq','7100000')">40m</button>
<button class="btn-sm" onclick="civ('freq','14200000')">20m</button>
<button class="btn-sm" onclick="civ('freq','21000000')">15m</button>
</div>

<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
<span style="color:#94a3b8;font-size:10px;line-height:24px">Modo:</span>
<button class="btn-sm" onclick="civ('mode',1)">USB</button>
<button class="btn-sm" onclick="civ('mode',0)">LSB</button>
<button class="btn-sm" onclick="civ('mode',5)">FM</button>
<button class="btn-sm" onclick="civ('mode',3)">CW</button>
<button class="btn-sm" onclick="civ('mode',2)">AM</button>
</div>

<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
<span style="color:#94a3b8;font-size:10px;line-height:24px">AGC:</span>
<button class="btn-sm" onclick="civ('agc',0)">OFF</button>
<button class="btn-sm" onclick="civ('agc',1)">FAST</button>
<button class="btn-sm" onclick="civ('agc',2)">MID</button>
<button class="btn-sm" onclick="civ('agc',3)">SLOW</button>
<span style="color:#94a3b8;font-size:10px;line-height:24px;margin-left:8px">PRE:</span>
<button class="btn-sm" onclick="civ('pre',0)">OFF</button>
<button class="btn-sm" onclick="civ('pre',1)">ON1</button>
<button class="btn-sm" onclick="civ('pre',2)">ON2</button>
<span style="color:#94a3b8;font-size:10px;line-height:24px;margin-left:8px">ATT:</span>
<button class="btn-sm" onclick="civ('att',0)">OFF</button>
<button class="btn-sm" onclick="civ('att',1)">ON</button>
</div>
</div>

<div class="card">
<h2>Ganhos</h2>
<div><label>RF Gain: <span class="slider-val" id="v_rf">50</span></label>
<input type="range" class="slider" min="0" max="255" value="50" id="sl_rf" oninput="document.getElementById('v_rf').textContent=this.value"></div>
<button class="btn-sm" onclick="civ('rfg',document.getElementById('sl_rf').value)">Aplicar RF</button>
<div style="margin-top:6px"><label>AF Gain: <span class="slider-val" id="v_af">50</span></label>
<input type="range" class="slider" min="0" max="255" value="50" id="sl_af" oninput="document.getElementById('v_af').textContent=this.value"></div>
<button class="btn-sm" onclick="civ('afg',document.getElementById('sl_af').value)">Aplicar AF</button>
</div>

<div class="card">
<h2>Frequencia Manual</h2>
<div style="display:flex;gap:4px">
<input type="number" id="inp_freq" placeholder="Freq em Hz ex: 7100000" style="flex:1">
<button class="btn-sm" onclick="civ('freq',document.getElementById('inp_freq').value)">Set</button>
</div>
</div>
</div>

<div id="tb-ic705" style="display:none">
<h2>IC-705 CAT over BLE</h2>
<div class="card">
<div class="grid3">
<div class="gitem"><div class="glabel">BLE</div><div class="gval" id="s_ic5">---</div></div>
<div class="gitem"><div class="glabel">CI-V Bus</div><div class="gval" id="s_civ">---</div></div>
<div class="gitem"><div class="glabel">Pareado</div><div class="gval" id="s_pair">---</div></div>
</div>
<div style="background:#1a2a3a;padding:8px;border-radius:3px;font-size:11px;color:#94a3b8;margin:8px 0;line-height:1.5">
<strong style="color:#FFB300">Procedimento:</strong><br>
1. No IC-705: <strong>Menu → Set → Bluetooth Set → Pairing Reception</strong><br>
2. Clique em <strong>"Escanear IC-705"</strong> abaixo<br>
3. O ESP32 encontra e conecta automaticamente<br>
4. Apos pareamento, o barramento CI-V e liberado.
</div>
<button onclick="scanIC5()" id="b_scan5">Escanear IC-705</button>
<button class="btn-red" onclick="discIC5()">Desconectar</button>
<hr style="border-color:rgba(79,195,247,0.1);margin:8px 0">
<label><input type="checkbox" id="ce" onchange="void(0)"> CAT ativado</label>
<label>Porta destino</label>
<select id="cp"><option value="0">= ativa</option><option value="1">PORT1</option><option value="2">PORT2</option><option value="3">PORT3</option><option value="4">PORT4</option></select>
<label>Endereco CI-V do radio</label>
<select id="ca_addr">
<option value="0xA4">IC-705 (0xA4)</option>
<option value="0x94">IC-7300 (0x94)</option>
<option value="0x18">IC-7100 (0x18)</option>
<option value="0x76">IC-7610 (0x76)</option>
<option value="0x98">IC-705 alt (0x98)</option>
<option value="0x88">IC-9700 (0x88)</option>
<option value="0x70">IC-7000 (0x70)</option>
<option value="0x48">IC-706 (0x48)</option>
<option value="0x3A">IC-2730 (0x3A)</option>
<option value="0xE0">PC (0xE0)</option>
</select>
<label>Nome BLE</label>
<input type="text" id="bn" placeholder="ESP32-CIV-GW">
<button onclick="saveIC5()">Salvar</button>
</div>
</div>

<div id="tb-wifi" style="display:none"><h2>WiFi</h2>
<div class="card">
<h2>AP</h2><label>SSID</label><input type="text" id="aps"><label>Senha</label><input type="password" id="app"><button onclick="sAP()">Salvar AP</button>
</div>
<div class="card">
<h2>Redes Disponiveis</h2>
<div style="display:flex;gap:4px"><select id="sta_sel" style="flex:1" onchange="selRede(this)"><option value="">--</option></select><button class="btn-sm btn-outline" onclick="scanWiFi()" id="b_scanw">&#x21bb;</button></div>
<div id="scanr"></div>
</div>
<div class="card">
<h2>Redes Gerenciadas</h2>
<div id="rede-list"></div>
<div id="rede-edit" style="display:none;margin-top:8px">
<label>SSID</label><input type="text" id="essid">
<label>Senha</label><input type="password" id="epass">
<button onclick="salvarRede()">Salvar</button>
<button class="btn-outline" onclick="cancelarRede()">Cancelar</button>
</div>
<button onclick="addRede()">+ Adicionar Rede</button>
</div>
<div class="card">
<h2>IP</h2>
<label><input type="checkbox" id="dhcp" checked onchange="document.getElementById('ipf').style.display=this.checked?'none':'block'"> DHCP</label>
<div id="ipf" style="display:none">
<label>IP</label><input type="text" id="sip"><label>GW</label><input type="text" id="sgw"><label>Mask</label><input type="text" id="ssn"><label>DNS1</label><input type="text" id="sd1"><label>DNS2</label><input type="text" id="sd2">
</div>
<button onclick="sIP()">Salvar IP</button>
</div>
</div>

<div id="tb-bluetooth" style="display:none"><h2>Bluetooth</h2>
<div class="card">
<h2>Configuracao BLE</h2>
<label>Nome do dispositivo</label>
<input type="text" id="btn" placeholder="ESP32-CIV-GW">
<label>Senha de pareamento (PIN)</label>
<input type="text" id="btp" placeholder="1234" maxlength="6">
<p class="info-text" style="margin-top:4px">Use esta senha ao parear seu smartphone ou tablet com o ESP32.</p>
<button onclick="sBT()">Salvar Bluetooth</button>
</div>
<div class="card">
<h2>Status BLE</h2>
<div class="grid3">
<div class="gitem"><div class="glabel">Dispositivo</div><div class="gval" id="sbtn">---</div></div>
<div class="gitem"><div class="glabel">Conexao</div><div class="gval" id="sbtcon">---</div></div>
<div class="gitem"><div class="glabel">Senha</div><div class="gval" id="sbtp">---</div></div>
</div>
</div>
<div class="card">
<h2>Escanear Dispositivos</h2>
<button onclick="scanBLE()" id="b_scanble">Escanear BLE</button>
<div id="ble-result"></div>
<div id="ble-list"></div>
</div>
<div class="card">
<h2>Dispositivos Salvos</h2>
<div id="bt-saved-list"></div>
</div>
</div>

<div id="tb-logs" style="display:none"><h2>Logs do Sistema</h2>
<div class="card">
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
<label style="font-size:10px;color:#e2e8f0"><input type="checkbox" id="lb_BLE" checked onchange="salvarLogPref()"> BLE</label>
<label style="font-size:10px;color:#e2e8f0"><input type="checkbox" id="lb_CIV" checked onchange="salvarLogPref()"> CI-V</label>
<label style="font-size:10px;color:#e2e8f0"><input type="checkbox" id="lb_IC705" checked onchange="salvarLogPref()"> IC-705</label>
<label style="font-size:10px;color:#e2e8f0"><input type="checkbox" id="lb_WiFi" checked onchange="salvarLogPref()"> WiFi</label>
<label style="font-size:10px;color:#e2e8f0"><input type="checkbox" id="lb_SYS" checked onchange="salvarLogPref()"> Sistema</label>
<label style="font-size:10px;color:#e2e8f0"><input type="checkbox" id="lb_ERRO" checked onchange="salvarLogPref()"> Erros</label>
<button class="btn-sm btn-outline" onclick="carregarLogs()" style="margin-left:auto">Atualizar</button>
</div>
<div id="loglist" style="max-height:400px;overflow-y:auto;font-family:monospace;font-size:10px;line-height:1.4;background:#0a1118;padding:6px;border-radius:3px"></div>
</div>
</div>

<div id="tb-admin" style="display:none"><h2>Administração <button class="btn-sm btn-outline" onclick="sair()" style="float:right">Sair</button></h2>
<div class="card"><h2>Alterar Senha</h2>
<label>Usuário</label><input type="text" id="au_user">
<label>Senha atual</label><input type="password" id="au_oldpass">
<label>Nova senha</label><input type="password" id="au_newpass">
<button onclick="altSenha()">Alterar Senha</button></div>
<div class="card"><h2>Gerenciar Usuários</h2>
<div id="user-list"></div>
<div style="margin-top:6px"><label>Novo usuário</label>
<input type="text" id="nu_user" placeholder="usuário"><input type="password" id="nu_pass" placeholder="senha">
<button onclick="addUser()">Adicionar</button></div>
</div>
<div class="card"><h2>Atualização de Firmware</h2>
<p style="font-size:11px;color:#94a3b8">Versão atual: <strong id="fwver">v1.0.1</strong></p>
<input type="file" id="fwfile" accept=".bin" style="display:none">
<div style="display:flex;gap:4px;margin-top:6px">
<button onclick="document.getElementById('fwfile').click()">Selecionar</button>
<button onclick="fwUpload()" id="fwbtn" disabled>Atualizar</button>
</div>
<div id="fwprog" style="display:none;margin-top:8px">
<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">
<span id="fwstatus">Aguardando...</span><span id="fwtime">--</span></div>
<div style="height:8px;background:#1a2a3a;border-radius:4px;margin-top:4px"><div id="fwbar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#4fc3f7);border-radius:4px;transition:width .3s"></div></div>
</div>
</div>
</div>

<div id="tb-civ" style="display:none"><h2>CI-V</h2>
<div class="card">
<label>Porta Ativa</label><select id="ap"><option value="1">PORT1</option><option value="2">PORT2</option><option value="3">PORT3</option><option value="4">PORT4</option></select>
<label>Baud</label><select id="cb"><option value="9600">9600</option><option value="19200">19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select>
<label>Endereco</label><select id="ca">
<option value="0x94">IC-7300</option><option value="0x18">IC-7100</option><option value="0x76">IC-7610</option>
<option value="0x98">IC-705</option><option value="0x88">IC-9700</option><option value="0x70">IC-7000</option>
<option value="0x48">IC-706</option><option value="0x39">IC-2730</option>
</select>
<button onclick="sCIV()">Salvar</button>
</div>
</div>

<div id="toast" class="toast"></div>
<script>
function st(el){
  var tab=el.getAttribute('data-tab');
  var tabs=document.querySelectorAll('.tab');
  for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('active');
  var conts=document.querySelectorAll('[id^="tb-"]');
  for(var i=0;i<conts.length;i++)conts[i].style.display='none';
  document.getElementById('tb-'+tab).style.display='block';
  el.classList.add('active');
  if(tab=='radio'||tab=='ic705'||tab=='bluetooth'){carregar();carregarBT();}
  if(tab=='wifi'){carregar();listarRedes();carregarRedes();}
  if(tab=='logs')carregarLogPref();
  if(tab=='admin')carregarUsers();
}
function toast(m,t){
  var d=document.getElementById('toast');
  d.textContent=m;d.className='toast '+t;
  setTimeout(function(){d.className='toast';},2500);
}
function carregar(){
  var x=new XMLHttpRequest();
  x.open('GET','/api/status',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      var fhz=parseInt(d.freq)||0;var fm=Math.floor(fhz/1000000);var fk=Math.floor((fhz%1000000)/1000);var fh=fhz%1000;document.getElementById('v_freq').textContent=fhz?fm+'.'+('000'+fk).slice(-3)+'.'+('000'+fh).slice(-3)+' Hz':'---';
      document.getElementById('v_mode').textContent=d.mode||'---';
      document.getElementById('v_ptt').innerHTML='<span class="badge '+(d.ptt?'bg-red':'bg-green')+'">'+(d.ptt?'TX':'RX')+'</span>';
      var sm=d.smeter||0;
      var dbm=-127+sm*114/255;
      var sUnit='S0';
      if(dbm>-73){var ov=Math.round((dbm+73)/-10)*-10;sUnit='S9+'+(ov<0?0:ov)+'dB';}
      else if(dbm>-127){var sv=Math.round((127+dbm)/6);sUnit='S'+Math.min(9,Math.max(0,sv));}
      document.getElementById('stxt').textContent=d.pwr?'---':sUnit;
      document.getElementById('stxt2').textContent=d.pwr?'TX':Math.round(dbm)+' dBm';
      document.getElementById('sbar').style.width=Math.min(sm/255*100,100)+'%';
      document.getElementById('v_pwr').innerHTML='<span class="badge '+(d.pwr?'bg-green':'bg-red')+'">'+(d.pwr?'ON':'OFF')+'</span>';
      document.getElementById('v_split').innerHTML='<span class="badge '+(d.split?'bg-green':'bg-red')+'">'+(d.split?'ON':'OFF')+'</span>';
      var agcN=['OFF','FAST','MID','SLOW'];document.getElementById('v_agc').textContent=d.agc!==undefined?agcN[d.agc]||'---':'---';
      var preN=['OFF','ON1','ON2'];document.getElementById('v_pre').textContent=(d.pre!==undefined?preN[d.pre]||'---':'---')+' / '+(d.att?'ATT':'');
      document.getElementById('v_rf').textContent=d.rf||'50';document.getElementById('sl_rf').value=d.rf||'50';
      document.getElementById('v_af').textContent=d.af||'50';document.getElementById('sl_af').value=d.af||'50';
      document.getElementById('s_ic5').innerHTML=d.ic5con?'<span class="badge bg-green">CON</span>':'<span class="badge bg-red">---</span>';
      document.getElementById('s_civ').innerHTML=d.ic5civ?'<span class="badge bg-green">OK</span>':'<span class="badge bg-red">---</span>';
      document.getElementById('s_pair').innerHTML=d.ic5pair?'<span class="badge bg-green">OK</span>':'<span class="badge bg-red">---</span>';
      document.getElementById('sbtn').textContent=d.btn||'---';
      document.getElementById('sbtcon').innerHTML=d.nuscon?'<span class="badge bg-green">Conectado</span>':'<span class="badge bg-red">Aguardando</span>';
      document.getElementById('sbtp').textContent=d.btp||'----';
    }catch(e){}
  };
  x.send();
}
function carregarCfg(){
  var x=new XMLHttpRequest();
  x.open('GET','/api/config',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      document.getElementById('ce').checked=d.ce!==false;document.getElementById('cp').value=d.cp||0;
      document.getElementById('bn').value=d.bn||'';
      document.getElementById('btn').value=d.btn||'';
      document.getElementById('btp').value=d.btp||'1234';
      if(d.ca705)document.getElementById('ca_addr').value=d.ca705;
      document.getElementById('aps').value=d.aps||'';document.getElementById('app').value=d.app||'';
      document.getElementById('stas').value=d.stas||'';document.getElementById('stap').value=d.stap||'';
      document.getElementById('dhcp').checked=d.dh!==false;
      document.getElementById('sip').value=d.sip||'';document.getElementById('sgw').value=d.sgw||'';
      document.getElementById('ssn').value=d.ssn||'';document.getElementById('sd1').value=d.sd1||'';document.getElementById('sd2').value=d.sd2||'';
      document.getElementById('ap').value=d.ap||1;document.getElementById('cb').value=d.cb||19200;document.getElementById('ca').value=d.ca||'0x94';
      document.getElementById('ipf').style.display=d.dh!==false?'none':'block';
    }catch(e){}
  };
  x.send();
}
function civ(c,v){
  var d={};d[c]=v;
  var x=new XMLHttpRequest();
  x.open('POST','/api/civ',true);
  x.setRequestHeader('Content-Type','application/json');
  x.onload=function(){try{var r=JSON.parse(x.responseText);toast(r.success?'OK':'Erro',r.success?'ok':'err');}catch(e){toast('Erro','err');}};
  x.send(JSON.stringify(d));
  if(c=='ptt'||c=='pwr')setTimeout(carregar,500);
}
function envia(url,data,cb){
  var x=new XMLHttpRequest();
  x.open('POST',url,true);
  x.setRequestHeader('Content-Type','application/json');
  x.onload=function(){
    try{
      var r=JSON.parse(x.responseText);
      var msg=r.msg||(r.success?'OK':'Falha');
      toast(msg,r.success?'ok':'err');
      if(cb)cb();
    }catch(e){toast('Erro: resposta invalida','err');}
  };
  x.onerror=function(){toast('Erro de conexao','err');};
  x.send(JSON.stringify(data));
}
function scanIC5(){envia('/api/save',{scan_ic5:true});toast('Escaneando IC-705...','info');}
function discIC5(){envia('/api/save',{disc_ic5:true});}
function saveIC5(){
  envia('/api/save',{
    ce:document.getElementById('ce').checked,
    cp:parseInt(document.getElementById('cp').value),
    bn:document.getElementById('bn').value,
    ca705:document.getElementById('ca_addr').value
  });
}
// BLE Scanner
function scanBLE(){
  var b=document.getElementById('b_scanble');
  b.disabled=true;b.textContent='Escaneando...';
  document.getElementById('ble-result').innerHTML='<p style="color:#94a3b8;font-size:11px">Escaneando dispositivos BLE...</p>';
  var x=new XMLHttpRequest();
  x.open('GET','/api/ble_scan?start=1',true);
  x.onload=function(){
    (function poll(){
      var x2=new XMLHttpRequest();
      x2.open('GET','/api/ble_scan',true);
      x2.onload=function(){
        try{
          var d=JSON.parse(x2.responseText);
          if(!d.scanning){
            var html='';
            if(d.devices&&d.devices.length>0){
              for(var i=0;i<d.devices.length;i++){
                var dev=d.devices[i];
                html+='<div style="display:flex;align-items:center;gap:4px;padding:4px;background:#1a2a3a;margin:2px 0;border-radius:3px">';
                html+='<span style="flex:1;color:#e2e8f0;font-size:11px">'+(dev.n||'?')+'</span>';
                html+='<span style="color:#94a3b8;font-size:10px">'+dev.r+'dBm</span>';
                html+='<button class="btn-sm" onclick="salvarBTDevice(\''+dev.a+'\',\''+(dev.n||'?')+'\')">Salvar</button>';
                html+='</div>';
              }
            } else {
              html='<p style="color:#94a3b8;font-size:11px">Nenhum dispositivo encontrado.</p>';
            }
            document.getElementById('ble-list').innerHTML=html;
            document.getElementById('ble-result').innerHTML='<p style="color:#10b981;font-size:11px">'+(d.devices?d.devices.length:0)+' dispositivos.</p>';
            b.disabled=false;b.textContent='Escanear BLE';
            return;
          }
        }catch(e){}
        setTimeout(poll,1000);
      };
      x2.send();
    })();
  };
  x.send();
}

function salvarBTDevice(addr,name){
  envia('/api/save',{bt_add_a:addr,bt_add_n:name},function(){carregarBT();});
}

function carregarBT(){
  var x=new XMLHttpRequest();
  x.open('GET','/api/bt_devices',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      var html='';
      if(d.devices&&d.devices.length>0){
        for(var i=0;i<d.devices.length;i++){
          var dev=d.devices[i];
          html+='<div style="display:flex;align-items:center;gap:4px;padding:4px;background:#1a2a3a;margin:2px 0;border-radius:3px">';
          html+='<span style="flex:1;color:#e2e8f0;font-size:11px">'+(dev.n||'?')+'</span>';
          html+='<span style="color:#94a3b8;font-size:9px">'+dev.a+'</span>';
          html+='<button class="btn-sm" style="background:#ef4444" onclick="excluirBT('+i+')">X</button>';
          html+='</div>';
        }
      } else {
        html='<p style="color:#94a3b8;font-size:11px">Nenhum dispositivo salvo.</p>';
      }
      document.getElementById('bt-saved-list').innerHTML=html;
    }catch(e){}
  };
  x.send();
}

function excluirBT(idx){
  envia('/api/save',{bt_del:idx},function(){carregarBT();});
}

function sBT(){
  var btn=document.getElementById('btn').value;
  var btp=document.getElementById('btp').value;
  if(!btp||btp.length<4||btp.length>6){toast('Senha deve ter 4-6 digitos','err');return;}
  envia('/api/save',{btn:btn,btp:btp},function(){toast('Reinicie o ESP32 para aplicar','info');});
}
function sAP(){envia('/api/save',{aps:document.getElementById('aps').value,app:document.getElementById('app').value});}
function sSTA(){sIP();}
function sIP(){
  var p='sip='+encodeURIComponent(document.getElementById('sip').value)+'&sgw='+encodeURIComponent(document.getElementById('sgw').value)+'&ssn='+encodeURIComponent(document.getElementById('ssn').value)+'&sd1='+encodeURIComponent(document.getElementById('sd1').value)+'&sd2='+encodeURIComponent(document.getElementById('sd2').value)+'&dh='+(document.getElementById('dhcp').checked?'1':'0');
  var x=new XMLHttpRequest();
  x.open('GET','/api/save?'+p,true);
  x.onload=function(){try{var r=JSON.parse(x.responseText);toast(r.msg||(r.success?'OK':'Falha'),r.success?'ok':'err');carregarRedes();}catch(e){toast('Erro','err');}};
  x.onerror=function(){toast('Erro de conexao','err');};
  x.send();
}
function selRede(el){document.getElementById('essid').value=el.value;}

// Gerenciamento de multiplas redes WiFi
function carregarRedes(){
  var x=new XMLHttpRequest();
  x.open('GET','/api/wifi_nets',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      var list=document.getElementById('rede-list');
      var html='';
      for(var i=0;i<d.nets.length;i++){
        var n=d.nets[i];
        html+='<div style="display:flex;align-items:center;gap:4px;padding:4px;background:#1a2a3a;margin:2px 0;border-radius:3px">';
        html+='<span style="color:#94a3b8;font-size:10px;min-width:20px">'+(i+1)+'.</span>';
        html+='<span style="flex:1;color:#e2e8f0;font-size:12px">'+n.s+'</span>';
        html+='<button class="btn-sm" onclick="editarRede('+i+')">E</button>';
        html+='<button class="btn-sm btn-outline" onclick="subirRede('+i+')">&#8593;</button>';
        html+='<button class="btn-sm btn-outline" onclick="descerRede('+i+')">&#8595;</button>';
        html+='<button class="btn-sm" style="background:#ef4444" onclick="excluirRede('+i+')">X</button>';
        html+='</div>';
      }
      if(d.nets.length==0) html+='<p style="color:#94a3b8;font-size:11px">Nenhuma rede cadastrada.</p>';
      list.innerHTML=html;
    }catch(e){}
  };
  x.send();
}
function addRede(){
  document.getElementById('rede-edit').style.display='block';
  document.getElementById('essid').value='';
  document.getElementById('epass').value='';
  document.getElementById('essid').focus();
}
function editarRede(idx){
  var x=new XMLHttpRequest();
  x.open('GET','/api/wifi_nets?edit='+idx,true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      document.getElementById('essid').value=d.nets[idx].s;
      document.getElementById('epass').value=d.nets[idx].p||'';
      document.getElementById('rede-edit').style.display='block';
    }catch(e){}
  };
  x.send();
}
function salvarRede(){
  var s=document.getElementById('essid').value;
  var p=document.getElementById('epass').value;
  if(!s){toast('SSID obrigatorio','err');return;}
  envia('/api/save',{wn_add_s:s,wn_add_p:p});
  document.getElementById('rede-edit').style.display='none';
  setTimeout(carregarRedes,500);
}
function cancelarRede(){document.getElementById('rede-edit').style.display='none';}
function subirRede(idx){envia('/api/save',{wn_move:idx,wn_dir:-1});setTimeout(carregarRedes,500);}
function descerRede(idx){envia('/api/save',{wn_move:idx,wn_dir:1});setTimeout(carregarRedes,500);}
function excluirRede(idx){envia('/api/save',{wn_del:idx});setTimeout(carregarRedes,500);}
function sCIV(){envia('/api/save',{ap:parseInt(document.getElementById('ap').value),cb:parseInt(document.getElementById('cb').value),ca:document.getElementById('ca').value});}
function listarRedes(networks){
  var s=document.getElementById('sta_sel');s.innerHTML='<option value="">--</option>';
  if(!networks)return;
  var seen={};
  for(var i=0;i<networks.length;i++){
    var n=networks[i];
    if(!n.ssid||seen[n.ssid])continue;
    seen[n.ssid]=true;
    var o=document.createElement('option');o.value=n.ssid;o.textContent=n.ssid+(n.open?'':'\uD83D\uDD12');s.appendChild(o);
  }
}
function scanWiFi(){
  document.getElementById('b_scanw').disabled=true;document.getElementById('b_scanw').textContent='...';
  document.getElementById('scanr').innerHTML='<p style="color:#94a3b8;font-size:11px">Escaneando...</p>';
  var x=new XMLHttpRequest();
  x.open('GET','/api/scan',true);
  x.onload=function(){
    (function poll(){
      var x2=new XMLHttpRequest();
      x2.open('GET','/api/scan',true);
      x2.onload=function(){
        try{
          var d=JSON.parse(x2.responseText);
          if(!d.scanning){listarRedes(d.networks);document.getElementById('scanr').innerHTML='<p style="color:#10b981;font-size:11px">'+(d.networks?d.networks.length:0)+' redes.</p>';document.getElementById('b_scanw').disabled=false;document.getElementById('b_scanw').textContent='\u21BB';return;}
        }catch(e){}
        setTimeout(poll,1000);
      };
      x2.send();
    })();
  };
  x.send();
}
function carregarLogPref(){
  var x=new XMLHttpRequest();
  x.open('GET','/api/config',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      if(d.lBLE!=undefined)document.getElementById('lb_BLE').checked=d.lBLE==1;
      if(d.lCIV!=undefined)document.getElementById('lb_CIV').checked=d.lCIV==1;
      if(d.lIC705!=undefined)document.getElementById('lb_IC705').checked=d.lIC705==1;
      if(d.lWiFi!=undefined)document.getElementById('lb_WiFi').checked=d.lWiFi==1;
      if(d.lSYS!=undefined)document.getElementById('lb_SYS').checked=d.lSYS==1;
      if(d.lERRO!=undefined)document.getElementById('lb_ERRO').checked=d.lERRO==1;
      carregarLogs();
    }catch(e){carregarLogs();}
  };
  x.onerror=function(){carregarLogs();};
  x.send();
}
function carregarLogs(){
  var tipos=[];
  ['BLE','CIV','IC705','WiFi','SYS','ERRO'].forEach(function(t){
    var cb=document.getElementById('lb_'+t);
    if(cb&&cb.checked)tipos.push(t);
  });
  var filtro=tipos.join(',');
  var x=new XMLHttpRequest();
  x.open('GET','/api/logs?type='+filtro+'&count=100',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      var html='';
      for(var i=0;i<d.length;i++){
        var e=d[i];
        var cor=e.t=='ERRO'?'#ef4444':e.t=='CIV'?'#4fc3f7':e.t=='IC705'?'#FFB300':e.t=='BLE'?'#10b981':e.t=='WiFi'?'#3b82f6':'#94a3b8';
        var ts=new Date(e.s*1000).toLocaleTimeString('pt-BR');
        html+='<div style="color:'+cor+'"><span style="color:#555">'+ts+'</span> ['+e.t+'] '+e.m+'</div>';
      }
      if(!html)html='<div style="color:#555">Nenhum log habilitado.</div>';
      document.getElementById('loglist').innerHTML=html;
    }catch(e){document.getElementById('loglist').innerHTML='<div style="color:#ef4444">Erro ao carregar</div>';}
  };
  x.send();
}

function salvarLogPref(){
  var pref={};
  ['BLE','CIV','IC705','WiFi','SYS','ERRO'].forEach(function(t){
    var cb=document.getElementById('lb_'+t);
    if(cb)pref['l'+t]=cb.checked?1:0;
  });
  var x=new XMLHttpRequest();
  x.open('POST','/api/save',true);
  x.setRequestHeader('Content-Type','application/json');
  x.send(JSON.stringify(pref));
  carregarLogs();
}

function carregarUsers(){
  var x=new XMLHttpRequest();
  x.open('GET','/api/config',true);
  x.onload=function(){
    try{
      var d=JSON.parse(x.responseText);
      if(d.users){
        var html='';
        for(var i=0;i<d.users.length;i++){
          var u=d.users[i];
          html+='<div style="display:flex;align-items:center;gap:4px;padding:4px;background:#1a2a3a;margin:2px 0;border-radius:3px">';
          html+='<span style="flex:1;color:#e2e8f0;font-size:12px">'+u.n+'</span>';
          if(u.n!='admin')html+='<button class="btn-sm" style="background:#ef4444" onclick="delUser('+i+')">X</button>';
          else html+='<span style="color:#555;font-size:10px">(admin)</span>';
          html+='</div>';
        }
        document.getElementById('user-list').innerHTML=html;
      }
    }catch(e){}
  };
  x.send();
}
// Firmware update
document.getElementById('fwfile').addEventListener('change',function(){
  document.getElementById('fwbtn').disabled=!this.files||this.files.length==0;
  if(this.files&&this.files[0])document.getElementById('fwstatus').textContent='Arquivo: '+this.files[0].name+' ('+Math.round(this.files[0].size/1024)+'KB)';
});
function fwUpload(){
  var file=document.getElementById('fwfile').files[0];
  if(!file){toast('Selecione um arquivo','err');return;}
  if(!confirm('Atualizar firmware? O dispositivo será reiniciado.'))return;
  var prog=document.getElementById('fwprog'),bar=document.getElementById('fwbar'),status=document.getElementById('fwstatus'),time=document.getElementById('fwtime');
  prog.style.display='block';status.textContent='Enviando...';time.textContent='Calculando...';
  document.getElementById('fwbtn').disabled=true;
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/update',true);
  xhr.upload.onprogress=function(e){
    if(e.lengthComputable){
      var pct=Math.round(e.loaded/e.total*100);
      bar.style.width=pct+'%';
      status.textContent='Enviando: '+Math.round(e.loaded/1024)+'/'+Math.round(e.total/1024)+' KB ('+pct+'%)';
      // Estimar tempo restante
      if(e.loaded>0&&e.timeStamp){
        var elapsed=performance.now()-xhr._startTime;
        if(elapsed>0){var total=elapsed/e.loaded*e.total;var rem=Math.round((total-elapsed)/1000);time.textContent='~'+rem+'s restante'+(rem>1?'s':'');}
      }
    }
  };
  xhr._startTime=performance.now();
  xhr.onload=function(){
    if(xhr.status==200){status.textContent='Sucesso! Reiniciando...';toast('Firmware atualizado!','info');setTimeout(function(){window.location.href='/';},3000);}
    else{status.textContent='Erro!';toast('Falha na atualização','err');document.getElementById('fwbtn').disabled=false;}
  };
  xhr.onerror=function(){status.textContent='Erro de conexão';document.getElementById('fwbtn').disabled=false;};
  xhr.send(file);
}

function altSenha(){
  var u=document.getElementById('au_user').value,o=document.getElementById('au_oldpass').value,n=document.getElementById('au_newpass').value;
  if(!u||!o||!n){toast('Preencha todos os campos','err');return;}
  envia('/api/save',{chpass_user:u,chpass_old:o,chpass_new:n},function(){carregarUsers();});
}
function addUser(){
  var u=document.getElementById('nu_user').value,p=document.getElementById('nu_pass').value;
  if(!u||!p){toast('Preencha usuario e senha','err');return;}
  envia('/api/save',{adduser_n:u,adduser_p:p},function(){carregarUsers();document.getElementById('nu_user').value='';document.getElementById('nu_pass').value='';});
}
function delUser(idx){
  envia('/api/save',{deluser:idx},function(){carregarUsers();});
}
function sair(){
  var x=new XMLHttpRequest();x.open('GET','/api/logout',true);
  x.onload=function(){window.location.href='/login';};x.send();
}

carregar();
carregarCfg();
carregarRedes();
carregarBT();
carregarLogPref();
setInterval(carregar,2000);
</script></body></html>
)rawliteral";
  srv.send(200,"text/html",h);
}

void h_cfg() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  StaticJsonDocument<1024> d;
  d["aps"]=cfg.ap_ssid; d["app"]=cfg.ap_pass; d["stas"]=cfg.sta_ssid; d["stap"]=cfg.sta_pass; d["dh"]=cfg.sta_dhcp;
  d["sip"]=cfg.sta_ip.toString(); d["sgw"]=cfg.sta_gw.toString(); d["ssn"]=cfg.sta_sn.toString(); d["sd1"]=cfg.sta_d1.toString(); d["sd2"]=cfg.sta_d2.toString();
  { char buf[8]; snprintf(buf,sizeof(buf),"0x%02X",cfg.cat_addr); d["ca705"]=buf; }
  d["lBLE"]=log_enabled.ble?1:0; d["lCIV"]=log_enabled.civ?1:0; d["lIC705"]=log_enabled.ic5?1:0;
  d["lWiFi"]=log_enabled.wifi?1:0; d["lSYS"]=log_enabled.sys?1:0; d["lERRO"]=log_enabled.erro?1:0;
  JsonArray usr=d.createNestedArray("users");
  for(int i=0;i<user_count;i++){JsonObject o=usr.createNestedObject();o["n"]=users[i].name;}
  d["bn"]=cfg.bt_name; d["btn"]=cfg.bt_name; d["btp"]=cfg.bt_pass; d["ce"]=cfg.cat_enabled; d["cp"]=cfg.cat_port;
  d["ap"]=cfg.active_port; d["cb"]=cfg.civ_baud[cfg.active_port-1]; d["ca"]="0x"+String(cfg.civ_addr[cfg.active_port-1],HEX);
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

void h_sts() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  StaticJsonDocument<512> d;
  d["ic5con"]=ic5con; d["ic5civ"]=ic5civ; d["ic5pair"]=ic5pair;
  d["freq"]=ic5_freq; d["mode"]=ic5_mode_str; d["ptt"]=ic5_ptt; d["pwr"]=ic5_pwr;
  d["mode_num"]=ic5_mode; d["filt"]=ic5_filt; d["split"]=ic5_split;
  d["agc"]=ic5_agc; d["pre"]=ic5_pre; d["att"]=ic5_att;
  d["btn"]=cfg.bt_name; d["btp"]=cfg.bt_pass; d["nuscon"]=nuscon;
  d["rf"]=ic5_rf; d["af"]=ic5_af; d["smeter"]=ic5_smeter;
  d["ap_ip"]=WiFi.softAPIP().toString(); d["sta_con"]=sta_con;
  d["sta_ip"]=sta_con?WiFi.localIP().toString():"";
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

// BLE scan callback for discovering nearby devices
String ble_scan_buf="[";
int ble_scan_cnt=0;

class BLEDeviceCB : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) {
    if(ble_scan_cnt>=30) return;
    if(ble_scan_cnt>0) ble_scan_buf+=",";
    ble_scan_buf+="{\"n\":\"";
    ble_scan_buf+=dev.getName().length()>0?dev.getName().c_str():"?";
    ble_scan_buf+="\",\"a\":\"";
    ble_scan_buf+=dev.getAddress().toString().c_str();
    ble_scan_buf+="\",\"r\":";
    ble_scan_buf+=dev.getRSSI();
    ble_scan_buf+="}";
    ble_scan_cnt++;
  }
};

void ble_scan() {
  if(ble_scan_active) return;
  ble_scan_active=true;
  ble_scan_buf="["; ble_scan_cnt=0;
  BLEScan* sc=BLEDevice::getScan();
  sc->setAdvertisedDeviceCallbacks(new BLEDeviceCB());
  sc->setInterval(100);
  sc->setWindow(50);
  sc->setActiveScan(true);
  sc->start(4,true);
}

void h_ble_scan() {
  String r;
  if(srv.arg("start")=="1"){
    ble_scan();
    StaticJsonDocument<64> d; d["scanning"]=true;
    serializeJson(d,r);
  } else {
    BLEScan* sc=BLEDevice::getScan();
    if(sc&&sc->isScanning()){
      StaticJsonDocument<64> d; d["scanning"]=true;
      serializeJson(d,r);
    } else {
      if(ble_scan_active){
        ble_scan_buf+="]";
        ble_scan_results="{\"scanning\":false,\"devices\":"+ble_scan_buf+"}";
        ble_scan_active=false;
      }
      r=ble_scan_results;
      if(r=="[]"){StaticJsonDocument<64> d; d["scanning"]=false; d["devices"]=JsonArray(); serializeJson(d,r);}
    }
  }
  srv.send(200,"application/json",r);
}

void h_bt_devices() {
  if(srv.method()==HTTP_POST){
    // Gerenciar dispositivos
  }
  // GET: listar dispositivos
  StaticJsonDocument<2048> d;
  JsonArray arr=d.createNestedArray("devices");
  for(int i=0;i<bt_device_count;i++){JsonObject o=arr.createNestedObject();o["n"]=bt_devices[i].name;o["a"]=bt_devices[i].addr;}
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

void h_wifi_nets() {
  StaticJsonDocument<2048> d;
  JsonArray nets=d.createNestedArray("nets");
  if(srv.hasArg("edit")){
    int idx=srv.arg("edit").toInt();
    if(idx>=0&&idx<wifi_net_count){
      for(int i=0;i<wifi_net_count;i++){
        JsonObject o=nets.createNestedObject();
        o["s"]=wifi_nets[i].ssid;
        o["p"]=(i==idx)?wifi_nets[i].pass:"";
      }
    }
  } else {
    for(int i=0;i<wifi_net_count;i++){JsonObject o=nets.createNestedObject();o["s"]=wifi_nets[i].ssid;o["p"]="";}
  }
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

void h_scan() {
  if(!scan_busy&&scan_n==0) wifi_scan();
  StaticJsonDocument<4096> d; d["scanning"]=scan_busy;
  if(!scan_busy&&scan_n>0){DynamicJsonDocument n(4096);DeserializationError e=deserializeJson(n,scan_json);if(!e)d["networks"]=n.as<JsonArray>();}
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

void h_save() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  StaticJsonDocument<1024> d;

  // Suporta GET (query string) e POST (JSON body)
  if(srv.method()==HTTP_GET){
    for(int i=0;i<srv.args();i++) d[srv.argName(i)]=srv.arg(i);
  } else {
    if(!srv.hasArg("plain")){srv.send(400,"application/json","{\"success\":false,\"msg\":\"sem corpo\"}");return;}
    if(deserializeJson(d,srv.arg("plain"))){srv.send(400,"application/json","{\"success\":false,\"msg\":\"JSON invalido\"}");return;}
  }

  if(d.containsKey("aps"))cfg.ap_ssid=d["aps"].as<String>();
  if(d.containsKey("app")&&d["app"].as<String>().length()>=8)cfg.ap_pass=d["app"].as<String>();
  if(d.containsKey("stas"))cfg.sta_ssid=d["stas"].as<String>();
  if(d.containsKey("stap"))cfg.sta_pass=d["stap"].as<String>();
  if(d.containsKey("dh"))cfg.sta_dhcp=(d["dh"]=="1"||d["dh"]==true);
  if(d.containsKey("sip"))cfg.sta_ip.fromString(d["sip"].as<String>());
  if(d.containsKey("sgw"))cfg.sta_gw.fromString(d["sgw"].as<String>());
  if(d.containsKey("ssn"))cfg.sta_sn.fromString(d["ssn"].as<String>());
  if(d.containsKey("sd1"))cfg.sta_d1.fromString(d["sd1"].as<String>());
  if(d.containsKey("sd2"))cfg.sta_d2.fromString(d["sd2"].as<String>());
  if(d.containsKey("bn"))cfg.bt_name=d["bn"].as<String>();
  if(d.containsKey("btn"))cfg.bt_name=d["btn"].as<String>();
  if(d.containsKey("btp")){String p=d["btp"].as<String>();if(p.length()>=4&&p.length()<=6)cfg.bt_pass=p;}
  // Preferencias de log
  if(d.containsKey("lBLE"))log_enabled.ble=d["lBLE"].as<int>()==1;
  if(d.containsKey("lCIV"))log_enabled.civ=d["lCIV"].as<int>()==1;
  if(d.containsKey("lIC705"))log_enabled.ic5=d["lIC705"].as<int>()==1;
  if(d.containsKey("lWiFi"))log_enabled.wifi=d["lWiFi"].as<int>()==1;
  if(d.containsKey("lSYS"))log_enabled.sys=d["lSYS"].as<int>()==1;
  if(d.containsKey("lERRO"))log_enabled.erro=d["lERRO"].as<int>()==1;
  // Gerenciamento de usuarios
  if(d.containsKey("chpass_user")){
    String u=d["chpass_user"].as<String>(),o=d["chpass_old"].as<String>(),n=d["chpass_new"].as<String>();
    for(int i=0;i<user_count;i++){if(u==users[i].name && o==users[i].pass){strncpy(users[i].pass,n.c_str(),19);save_cfg();srv.send(200,"application/json","{\"success\":true}");return;}}
    srv.send(200,"application/json","{\"success\":false}");return;
  }
  if(d.containsKey("adduser_n")){
    String n=d["adduser_n"].as<String>(),p=d["adduser_p"].as<String>();
    if(n.length()>0&&p.length()>0&&user_count<MAX_USERS){strncpy(users[user_count].name,n.c_str(),19);strncpy(users[user_count].pass,p.c_str(),19);user_count++;save_cfg();}
    srv.send(200,"application/json","{\"success\":true}");return;
  }
  if(d.containsKey("deluser")){
    int idx=d["deluser"].as<int>();
    if(idx>=0&&idx<user_count&&strcmp(users[idx].name,"admin")!=0){for(int i=idx;i<user_count-1;i++)users[i]=users[i+1];user_count--;save_cfg();}
    srv.send(200,"application/json","{\"success\":true}");return;
  }
  if(d.containsKey("ca705")){String a=d["ca705"].as<String>();cfg.cat_addr=(uint8_t)strtol(a.c_str(),NULL,16);civ_ic705_addr=cfg.cat_addr;}
  if(d.containsKey("ce"))cfg.cat_enabled=d["ce"].as<bool>();
  if(d.containsKey("cp"))cfg.cat_port=d["cp"].as<uint8_t>();
  if(d.containsKey("ap"))sel_port(d["ap"].as<uint8_t>());
  if(d.containsKey("cb")){cfg.civ_baud[cfg.active_port-1]=d["cb"].as<uint32_t>();rst_port(cfg.active_port);}
  if(d.containsKey("ca")){String a=d["ca"].as<String>();cfg.civ_addr[cfg.active_port-1]=(uint8_t)strtol(a.c_str(),NULL,16);}
  save_cfg();

  if(d.containsKey("disc_ic5")&&d["disc_ic5"].as<bool>()){if(ic5cli)ic5cli->disconnect();srv.send(200,"application/json","{\"success\":true}");return;}
  if(d.containsKey("scan_ic5")&&d["scan_ic5"].as<bool>()){scan_ic5();srv.send(200,"application/json","{\"success\":true}");return;}
  if(d.containsKey("reboot")&&d["reboot"].as<bool>()){srv.send(200,"application/json","{\"success\":true}");delay(500);ESP.restart();return;}

  // Gerenciamento de dispositivos Bluetooth
  if(d.containsKey("bt_add_a")){
    String a=d["bt_add_a"].as<String>(),n=d.containsKey("bt_add_n")?d["bt_add_n"].as<String>():"?";
    if(a.length()>0&&bt_device_count<MAX_BT_DEVICES){bt_devices[bt_device_count].addr=a;bt_devices[bt_device_count].name=n;bt_device_count++;save_bt_devices();}
    srv.send(200,"application/json","{\"success\":true}");return;
  }
  if(d.containsKey("bt_del")){
    int idx=d["bt_del"].as<int>();
    if(idx>=0&&idx<bt_device_count){for(int i=idx;i<bt_device_count-1;i++)bt_devices[i]=bt_devices[i+1];bt_device_count--;save_bt_devices();}
    srv.send(200,"application/json","{\"success\":true}");return;
  }

  // Gerenciamento de redes WiFi
  if(d.containsKey("wn_add_s")){
    String s=d["wn_add_s"].as<String>();
    String p=d.containsKey("wn_add_p")?d["wn_add_p"].as<String>():"";
    if(s.length()>0&&wifi_net_count<MAX_WIFI_NETS){
      wifi_nets[wifi_net_count].ssid=s; wifi_nets[wifi_net_count].pass=p; wifi_net_count++;
      save_wifi_nets();
      setup_sta(); // tentar conectar
    }
    srv.send(200,"application/json","{\"success\":true}");return;
  }
  if(d.containsKey("wn_del")){
    int idx=d["wn_del"].as<int>();
    if(idx>=0&&idx<wifi_net_count){
      for(int i=idx;i<wifi_net_count-1;i++){wifi_nets[i]=wifi_nets[i+1];}
      wifi_net_count--;
      save_wifi_nets();
    }
    srv.send(200,"application/json","{\"success\":true}");return;
  }
  if(d.containsKey("wn_move")){
    int idx=d["wn_move"].as<int>();
    int dir=d["wn_dir"].as<int>();
    int nidx=idx+dir;
    if(idx>=0&&idx<wifi_net_count&&nidx>=0&&nidx<wifi_net_count){
      WiFiNet tmp=wifi_nets[idx]; wifi_nets[idx]=wifi_nets[nidx]; wifi_nets[nidx]=tmp;
      save_wifi_nets();
    }
    srv.send(200,"application/json","{\"success\":true}");return;
  }

  // Se for configuracao WiFi STA, tentar conectar
  if(d.containsKey("stas")||d.containsKey("sip")||d.containsKey("sgw")||d.containsKey("ssn")||d.containsKey("sd1")){
    srv.send(200,"application/json","{\"success\":true,\"msg\":\"WiFi configurado, conectando...\"}");
    setup_sta();
    return;
  }

  srv.send(200,"application/json","{\"success\":true}");
}

void h_civ_cmd() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  if(!srv.hasArg("plain")){srv.send(400,"application/json","{\"success\":false}");return;}
  StaticJsonDocument<256> d;
  if(deserializeJson(d,srv.arg("plain"))){srv.send(400,"application/json","{\"success\":false}");return;}

  if(d.containsKey("freq")){uint64_t f=d["freq"].as<uint64_t>();Serial.printf("[CMD] set_freq: %llu\n",f);if(f>100000)set_freq(f);}
  else if(d.containsKey("mode"))set_mode(d["mode"].as<uint8_t>());
  else if(d.containsKey("ptt"))set_ptt(d["ptt"].as<int>()==1);
  else if(d.containsKey("pwr"))set_pwr(d["pwr"].as<int>()==1);
  else if(d.containsKey("agc"))set_agc(d["agc"].as<uint8_t>());
  else if(d.containsKey("pre"))set_pre(d["pre"].as<uint8_t>());
  else if(d.containsKey("att"))set_att(d["att"].as<uint8_t>());
  else if(d.containsKey("rfg"))set_rf(d["rfg"].as<uint8_t>());
  else if(d.containsKey("afg"))set_af(d["afg"].as<uint8_t>());
  else if(d.containsKey("split"))set_split(d["split"].as<int>()==1);

  srv.send(200,"application/json","{\"success\":true}");
}

void h_login_page() {
  String h=R"rawliteral(
<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>ESP32 CI-V Gateway - Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#0d1b2a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.card{background:#0a1118;border:1px solid rgba(79,195,247,0.2);border-radius:8px;padding:30px;width:100%;max-width:360px;text-align:center}
h1{color:#4fc3f7;font-size:20px;margin-bottom:20px}
input{width:100%;padding:10px;margin:8px 0;background:#1a2a3a;border:1px solid rgba(79,195,247,0.3);border-radius:4px;color:#e2e8f0;font-size:14px;outline:none}
input:focus{border-color:#4fc3f7}
button{width:100%;padding:12px;background:#4fc3f7;color:#0d1b2a;border:none;border-radius:4px;font-weight:bold;font-size:14px;cursor:pointer;margin-top:12px}
button:hover{background:#80d8ff}
#erro{color:#ef4444;font-size:13px;margin-top:8px;display:none}
</style></head><body>
<div class="card">
<h1>ESP32 CI-V Gateway</h1>
<input type="text" id="user" placeholder="Usuário" autocomplete="off">
<input type="password" id="pass" placeholder="Senha">
<button onclick="entrar()">Entrar</button>
<div id="erro">Usuário ou senha inválidos</div>
</div>
<script>
function entrar(){
  var u=document.getElementById('user').value,p=document.getElementById('pass').value;
  var x=new XMLHttpRequest();
  x.open('POST','/api/login',true);
  x.setRequestHeader('Content-Type','application/json');
  x.onload=function(){try{var d=JSON.parse(x.responseText);if(d.success)window.location.href='/';else document.getElementById('erro').style.display='block';}catch(e){}}
  x.send(JSON.stringify({user:u,pass:p}));
}
document.getElementById('user').focus();
document.getElementById('user').addEventListener('keydown',function(e){if(e.key=='Enter')document.getElementById('pass').focus()});
document.getElementById('pass').addEventListener('keydown',function(e){if(e.key=='Enter')entrar()});
</script></body></html>
)rawliteral";
  srv.send(200,"text/html",h);
}

void h_404(){srv.send(404,"application/json","{\"error\":\"Not found\"}");}

void h_login() {
  StaticJsonDocument<256> d;
  if(deserializeJson(d,srv.arg("plain"))){srv.send(400,"application/json","{\"success\":false}");return;}
  String u=d["user"].as<String>(); String p=d["pass"].as<String>();
  for(int i=0;i<user_count;i++){
    if(u==users[i].name && p==users[i].pass){loginOK();srv.send(200,"application/json","{\"success\":true}");return;}
  }
  srv.send(200,"application/json","{\"success\":false}");
}
void h_logout(){logout();srv.send(200,"application/json","{\"success\":true}");}

void h_logs() {
  String filter=srv.arg("type");
  int maxCount=srv.arg("count").toInt();
  if(maxCount<1||maxCount>200) maxCount=50;

  String r="[";
  int n=0;
  for(int i=0;i<logcount&&n<maxCount;i++){
    int idx=(logidx-1-i+LOG_MAX)%LOG_MAX;
    LogEntry& e=logbuf[idx];
    // Filtro: se houver tipos separados por virgula, aceita qualquer match
    if(filter.length()>0){
      bool match=false;
      int start=0,pos=0;
      while(pos<=(int)filter.length()){
        if(pos==(int)filter.length()||filter.charAt(pos)==','){
          String t=filter.substring(start,pos);
          t.trim();
          if(t==e.type){match=true;break;}
          start=pos+1;
        }
        pos++;
      }
      if(!match) continue;
    }
    if(n>0) r+=",";
    r+="{\"t\":\""; r+=e.type;
    r+="\",\"m\":\""; r+=e.msg;
    r+="\",\"s\":"; r+=e.time/1000;
    r+="}";
    n++;
  }
  r+="]";
  srv.send(200,"application/json",r);
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(SERIAL_BAUD);
  pinMode(PIN_LED,OUTPUT); digitalWrite(PIN_LED,LOW);

  // Aguarda Serial Monitor conectar (ate 5s)
  for(int i=0;i<5;i++){delay(1000);Serial.printf("\n[BOOT] Aguardando Serial... %ds\n",5-i);if(Serial)break;}

  Serial.println("\n=== ESP32 CI-V Gateway v" FIRMWARE_VERSION " ===\n");
  Serial.println("[BOOT] Iniciando...");
  load_cfg();

  p1.begin(cfg.civ_baud[0],SERIAL_8N1,PORT1_RX,PORT1_TX);
  p2.begin(cfg.civ_baud[1],SERIAL_8N1,PORT2_RX,PORT2_TX);
  p3.begin(cfg.civ_baud[2],SERIAL_8N1,PORT3_RX,PORT3_TX);
  Serial.println("[CI-V] 3 portas UART");
  sel_port(cfg.active_port);

  // Inicializa BLE primeiro (necessario para IC-705 e NUS)
  setup_nus();

  // Depois WiFi (coexistencia gerenciada pelo ESP32)
  setup_ap();
  setup_sta();
  setup_ws();

  // Tenta reconexao direta ao IC-705 (endereco salvo do pareamento anterior)
  if(cfg.cat_enabled && last_ic5_addr){
    Serial.printf("[IC705] Tentando reconexao direta a %s...\n",last_ic5_addr_str.c_str());
    ic5addr=last_ic5_addr;
    conn_ic5(*ic5addr);
  }

  // Scan IC-705 se nao conseguiu reconexao direta
  if(cfg.cat_enabled && !ic5con){
    Serial.println("[IC705] Scan em 3s... (Coloque IC-705 em Pairing Reception se necessario)");
    delay(3000);
    scan_ic5();
  }

  digitalWrite(PIN_LED,HIGH);
  addLog("SYS","Pronto! Web: http://%s/ BLE: %s",WiFi.softAPIP().toString().c_str(),cfg.bt_name.c_str());
  Serial.println("\n[SYS] Pronto!\n");
  Serial.printf("Web: http://%s/\n",WiFi.softAPIP().toString().c_str());
  Serial.printf("BLE: '%s' (NUS: %s)\n",cfg.bt_name.c_str(),NUS_SVC);
}

// ===================== LOOP =====================
void loop() {
  srv.handleClient();
  serial_cmd();
  wifi_chk();
  wifi_conn_tick();

  // Garantir que BLE esteja sempre anunciando (a cada 10s se desconectado)
  static unsigned long last_adv_chk=0;
  if(millis()-last_adv_chk>10000){
    last_adv_chk=millis();
    if(!nuscon){
      BLEDevice::startAdvertising();
      Serial.println("[BLE] Re-anunciando (check)");
    }
  }

  // Conexao IC-705
  if(ic5docon&&ic5addr&&!ic5con){conn_ic5(*ic5addr);ic5docon=false;}

  // Reconexao automatica: escaneia a cada 30s se desconectado
  if(cfg.cat_enabled&&!ic5con&&!ic5docon){
    static unsigned long last_scan=0;
    if(!last_scan||millis()-last_scan>30000){
      last_scan=millis();
      Serial.println("[IC705] Auto scan...");
      scan_ic5();
    }
  }

  // Envia Echo Back apos CI-V grant (unica vez)
  if(ic5civ && !echo_sent){
    echo_sent=true;
    delay(100);
    if(ic5ch && ic5cli && ic5cli->isConnected()){
      uint8_t eb[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,0x1A,0x01,0x01,CIV_END};
      ic5ch->writeValue(eb,sizeof(eb));
      Serial.println("[IC705] Echo Back ON enviado");
    }
  }

  if(cfg.cat_enabled){
    // Diagnostico da conexao IC-705 a cada 10s
    static unsigned long last_diag=0;
    if(millis()-last_diag>30000){
      last_diag=millis();
      Serial.printf("[DIAG] IC5: con=%d civ=%d pair=%d freq=%llu\n",ic5con,ic5civ,ic5pair,ic5_freq);
    }
    poll_ic5();
    proc_ic5();
    bridge_ic5p();
    bridge_pic5();
  }

  bridge_nusp();
  bridge_pnus();

  delay(1);
}
