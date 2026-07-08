/*
 * CAT-Bridge CAT/CI-V/BT Gateway v1.0.4
 * Gateway CI-V para Icom IC-705 via BLE + controle SPE Expert via RS232
 *
 * Recursos:
 * - Conexao BLE Central ao IC-705 com handshake de pareamento
 * - Polling de frequencia, modo, PTT, banda, AGC, preamp, att, S-meter
 * - Controle completo: liga/desliga, PTT, frequencia, modo, banda, AGC, preamp
 * - 4 portas fisicas (UART1, UART2, UART3, RS232)
 * - Suporte SPE Expert 1.3K-FA via protocolo proprietario (PORT4 RS232)
 * - Protocolo selecionavel por porta: CI-V ou SPE Expert
 * - Bridge bidirecional entre IC-705 e portas CI-V
 * - Interface Web com dashboard IC-705 + SPE Expert
 * - API REST para comandos CI-V e SPE
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
#define FIRMWARE_VERSION "1.0.4"
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

// ===================== PROTOCOL TYPES =====================
#define PROTO_CIV 0
#define PROTO_SPE 1
#define PROTO_YAESU 2
#define PROTO_KENWOOD 3
#define PROTO_HAMPLUS 4
#define PROTO_FLEXRADIO 5

// ===================== SPE CONSTANTS =====================
#define SPE_SYN 0x55
#define SPE_ACK 0xAA
#define SPE_CMD_INPUT 0x01
#define SPE_CMD_BAND_M 0x02
#define SPE_CMD_BAND_P 0x03
#define SPE_CMD_ANT 0x04
#define SPE_CMD_L_M 0x05
#define SPE_CMD_L_P 0x06
#define SPE_CMD_C_M 0x07
#define SPE_CMD_C_P 0x08
#define SPE_CMD_TUNE 0x09
#define SPE_CMD_OFF 0x0A
#define SPE_CMD_POWER 0x0B
#define SPE_CMD_DISPLAY 0x0C
#define SPE_CMD_OPERATE 0x0D
#define SPE_CMD_CAT 0x0E
#define SPE_CMD_LEFT 0x0F
#define SPE_CMD_RIGHT 0x10
#define SPE_CMD_SET 0x11
#define SPE_CMD_BL_ON 0x82
#define SPE_CMD_BL_OFF 0x83
#define SPE_CMD_STATUS 0x90
#define SPE_BAUD_DEFAULT 9600

// ===================== YAESU CAT CONSTANTS =====================
#define YAESU_BAUD_DEFAULT 38400
#define YS_BUF_LEN 128
#define YS_CMD_MAX 32
// Modos Yaesu (MD command P2 values)
#define YS_MODE_LSB 1
#define YS_MODE_USB 2
#define YS_MODE_CWU 3
#define YS_MODE_FM 4
#define YS_MODE_AM 5
#define YS_MODE_RTTYL 6
#define YS_MODE_CWL 7
#define YS_MODE_DATAL 8
#define YS_MODE_RTTYU 9
#define YS_MODE_DATAFM 0x0A
#define YS_MODE_FMN 0x0B
#define YS_MODE_DATAU 0x0C
#define YS_MODE_AMN 0x0D
#define YS_MODE_PSK 0x0E

// ===================== FLEXRADIO CONSTANTS =====================
// FlexRadio CAT e Kenwood-compativel (ASCII, ; terminator, 11-digit freq)
// Modos Flex (MD command)
#define FR_MODE_LSB 1
#define FR_MODE_USB 2
#define FR_MODE_CWL 3
#define FR_MODE_CWU 4
#define FR_MODE_FM 5
#define FR_MODE_AM 6
#define FR_MODE_DIGU 7
#define FR_MODE_DIGL 9

// ===================== KENWOOD CAT CONSTANTS =====================
// Modos Kenwood (MD command)
#define KW_MODE_LSB 1
#define KW_MODE_USB 2
#define KW_MODE_CW 3
#define KW_MODE_FM 4
#define KW_MODE_AM 5
#define KW_MODE_FSK 6
#define KW_MODE_CWR 7
#define KW_MODE_FSR 9

// ===================== HAMPLUS HP603 CONSTANTS =====================
#define HP_BAUD 9600
#define HP_BUF_LEN 32

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
  uint8_t port_proto[4] = {PROTO_CIV,PROTO_CIV,PROTO_CIV,PROTO_CIV};
  uint32_t spe_baud[4] = {SPE_BAUD_DEFAULT,SPE_BAUD_DEFAULT,SPE_BAUD_DEFAULT,SPE_BAUD_DEFAULT};
  bool port_enabled[4] = {true,true,true,true};
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

// ===================== YAESU STATUS =====================
uint8_t ys_rxbuf[YS_BUF_LEN]; int ys_rxlen = 0;
unsigned long last_ys_poll = 0;
// Yaesu usa as mesmas variaveis ic5_* para o Radio tab,
// mas precisamos de alguns buffers e timers adicionais
bool ys_connected = false;
char ys_last_cmd[YS_CMD_MAX] = "";
unsigned long ys_last_tx = 0;

// Origem da ultima mudanca em ic5_* (1=CIV, 2=CAT)
int last_change_src = 0;

// ===================== HAMPLUS STATUS =====================
uint8_t hp_rxbuf[HP_BUF_LEN]; int hp_rxlen = 0;
unsigned long last_hp_poll = 0;
int hp_antenna = 0;
int hp_radio = 0;
bool hp_split = false;
bool hp_ptt = false;
int hp_dir = 0;
int hp_rotor_active = 1;

// ===================== SPE STATUS =====================
#define SPE_BUF_LEN 128
uint8_t spe_rxbuf[SPE_BUF_LEN];
int spe_rxlen = 0;
bool spe_poll_pending = false;
unsigned long last_spe_poll = 0;

bool spe_op = false;
bool spe_tx = false;
char spe_bank = 'A';
int spe_input = 1;
int spe_band = 0;
int spe_ant = 0;
char spe_pwr_level = 'L';
int spe_pout = 0;
float spe_swr_atu = 0;
float spe_swr_ant = 0;
float spe_vpa = 0;
float spe_ipa = 0;
int spe_temp_up = 0;
int spe_temp_lw = 0;
int spe_temp_cmb = 0;
char spe_warn = 'N';
char spe_alarm = 'N';
char spe_id[4] = "13K";

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
  C_PWR_ON = 0x18, C_PWR_OFF = 0x18, C_PWR_READ = 0x1A,
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
void h_sysinfo();

// SPE functions
void sp_init();
void sp_send_cmd(uint8_t cmd);
void sp_send_bytes(uint8_t* data, int len);
void sp_poll();
void sp_read();
bool sp_is_active();
void spe_set_op(bool on);
void spe_set_pwr();
void spe_set_input(int i);
void spe_tune();

// Yaesu functions
void ys_send(const char* cmd);
void ys_read();
void ys_poll();
void ys_parse();
bool ys_is_active();

// Kenwood functions (mesmo formato ASCII que Yaesu)
void kw_send(const char* cmd);
void kw_read();
void kw_poll();
void kw_read();
void kw_parse();
bool kw_is_active();
// Tradutores de protocolo
void translate_civ_to_spe();
void translate_ys_to_spe();
void translate_kw_to_spe();
void translate_civ_to_cat();
void translate_cat_to_civ();

// Hamplus HP603
void hp_send(uint8_t cmd);
void hp_read();
void hp_poll();
void hp_parse();
bool hp_is_active();
void translate_to_hp();

// FlexRadio (Kenwood-compativel)
bool fr_is_active();
void fr_send(const char* cmd);
void fr_poll();
void fr_parse();
void fr_read();
void translate_hp_to_others();

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
//   pp_X - uint8  - protocol for port X (0=CI-V, 1=SPE)
//   sb_X - uint32 - SPE baud for port X
#define NVS_VER 3

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
  // Carregar protocolos das portas e baud SPE
  for(int i=0;i<4;i++){char kp[16],kb[16],ke[16];snprintf(kp,16,"pp_%d",i);snprintf(kb,16,"sb_%d",i);snprintf(ke,16,"pe_%d",i);cfg.port_proto[i]=nvs.getUChar(kp,PROTO_CIV);cfg.spe_baud[i]=nvs.getULong(kb,SPE_BAUD_DEFAULT);cfg.port_enabled[i]=nvs.getBool(ke,true);}
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
  // Salvar protocolos das portas e baud SPE
  for(int i=0;i<4;i++){char kp[16],kb[16],ke[16];snprintf(kp,16,"pp_%d",i);snprintf(kb,16,"sb_%d",i);snprintf(ke,16,"pe_%d",i);nvs.putUChar(kp,cfg.port_proto[i]);nvs.putULong(kb,cfg.spe_baud[i]);nvs.putBool(ke,cfg.port_enabled[i]);}
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
  if(fr_is_active()) {
    char cmd[20]; snprintf(cmd,20,"FA%011llu",f); fr_send(cmd);
    ic5_freq=f; Serial.printf("[FR] FA %llu\n",f); return;
  }
  if(kw_is_active()) {
    char cmd[20]; snprintf(cmd,20,"FA%011llu",f);
    kw_send(cmd); ic5_freq=f; Serial.printf("[KW] FA %llu\n",f); return;
  }
  if(ys_is_active()) {
    char cmd[16]; snprintf(cmd,16,"FA%09llu",f);
    ys_send(cmd);
    ic5_freq=f;
    Serial.printf("[YS] FA %llu\n",f);
    return;
  }
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
  if(fr_is_active()) {
    uint8_t fm=2;
    switch(m) { case 0: fm=1; break; case 1: fm=2; break; case 2: fm=6; break; case 3: fm=4; break; case 5: fm=5; break; }
    char cmd[8]; snprintf(cmd,8,"MD%d",fm); fr_send(cmd);
    ic5_mode=m; strcpy(ic5_mode_str,m<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[m][0]?mode_names[m]:"?");
    Serial.printf("[FR] Mode: %s\n", ic5_mode_str); return;
  }
  if(kw_is_active()) {
    uint8_t km=2;
    switch(m) { case 0: km=1; break; case 1: km=2; break; case 2: km=5; break; case 3: km=3; break; case 5: km=4; break; }
    char cmd[8]; snprintf(cmd,8,"MD%d",km); kw_send(cmd);
    ic5_mode=m; strcpy(ic5_mode_str,m<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[m][0]?mode_names[m]:"?");
    Serial.printf("[KW] Mode: %s\n", ic5_mode_str); return;
  }
  if(ys_is_active()) {
    uint8_t ym = 2;
    switch(m) { case 0: ym=1; break; case 1: ym=2; break; case 2: ym=5; break; case 3: ym=3; break; case 5: ym=4; break; }
    char cmd[8]; snprintf(cmd,8,"MD0%X",ym); ys_send(cmd);
    ic5_mode=m;
    if(m<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[m][0]) strcpy(ic5_mode_str,mode_names[m]);
    else snprintf(ic5_mode_str,8,"M%02X",m);
    Serial.printf("[YS] Modo: %s\n", ic5_mode_str); return;
  }
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_M_SET,m,0x01,CIV_END};
  send_civ(d,sizeof(d));
  ic5_mode=m;
  if(m<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[m][0]) strcpy(ic5_mode_str,mode_names[m]);
  else snprintf(ic5_mode_str,8,"M%02X",m);
  Serial.printf("[CI-V] Modo: %s\n", ic5_mode_str);
}

void set_ptt(bool on) {
  if(fr_is_active()) { fr_send(on?"TX1":"RX"); ic5_ptt=on; Serial.printf("[FR] PTT: %s\n", on?"TX":"RX"); return; }
  if(kw_is_active()) { kw_send(on?"TX0":"RX"); ic5_ptt=on; Serial.printf("[KW] PTT: %s\n", on?"TX":"RX"); return; }
  if(ys_is_active()) { ys_send(on?"MX1":"MX0"); ic5_ptt=on; Serial.printf("[YS] PTT: %s\n", on?"TX":"RX"); return; }
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_PTT_ON,on?0x01:0x00,CIV_END};
  send_civ(d,sizeof(d));
  ic5_ptt=on;
  Serial.printf("[CI-V] PTT: %s\n", on?"TX":"RX");
}

void set_pwr(bool on) {
  if(fr_is_active()) { fr_send(on?"PS1":"PS0"); ic5_pwr=on; Serial.printf("[FR] Power: %s\n", on?"ON":"OFF"); return; }
  if(kw_is_active()) { kw_send(on?"PS1":"PS0"); ic5_pwr=on; Serial.printf("[KW] Power: %s\n", on?"ON":"OFF"); return; }
  if(ys_is_active()) { ys_send(on?"PS1":"PS0"); ic5_pwr=on; Serial.printf("[YS] Power: %s\n", on?"ON":"OFF"); return; }
  if(on){
    uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,0x18,0x01,CIV_END};
    send_civ(d,sizeof(d));
  } else {
    uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,0x1A,0x05,0x00,0x73,0x01,CIV_END};
    send_civ(d,sizeof(d));
    delay(50);
    uint8_t d2[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,0x18,0x00,CIV_END};
    send_civ(d2,sizeof(d2));
  }
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
  if(fr_is_active()) { char cmd[8]; snprintf(cmd,8,"RG%03u",v); fr_send(cmd); ic5_rf=v; Serial.printf("[FR] RF: %u\n",v); return; }
  if(kw_is_active()) { char cmd[8]; snprintf(cmd,8,"RG%03u",v); kw_send(cmd); ic5_rf=v; Serial.printf("[KW] RF: %u\n",v); return; }
  if(ys_is_active()) { char cmd[8]; snprintf(cmd,8,"RG%03u",v); ys_send(cmd); ic5_rf=v; Serial.printf("[YS] RF: %u\n",v); return; }
  uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_RF_SET,0x12,v,CIV_END};
  send_civ(d,sizeof(d)); ic5_rf=v;
  Serial.printf("[CI-V] RF Gain: %u\n", v);
}

void set_af(uint8_t v) {
  if(fr_is_active()) { char cmd[8]; snprintf(cmd,8,"AG0%03u",v); fr_send(cmd); ic5_af=v; Serial.printf("[FR] AF: %u\n",v); return; }
  if(kw_is_active()) { char cmd[8]; snprintf(cmd,8,"AG0%03u",v); kw_send(cmd); ic5_af=v; Serial.printf("[KW] AF: %u\n",v); return; }
  if(ys_is_active()) { char cmd[8]; snprintf(cmd,8,"AG0%03u",v); ys_send(cmd); ic5_af=v; Serial.printf("[YS] AF: %u\n",v); return; }
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
    ic5_freq=bcd_freq(d,5,5); last_change_src=1;
    Serial.printf("[CI-V] Freq: %llu Hz\n", ic5_freq);
  }
  // FE FE 98 E0 04 <mode> <filt> FD
  else if(cmd==C_M_READ&&l>=7) {
    ic5_mode=d[5]; ic5_filt=d[6]; last_change_src=1;
    if(ic5_mode<sizeof(mode_names)/sizeof(mode_names[0])&&mode_names[ic5_mode][0]) strcpy(ic5_mode_str,mode_names[ic5_mode]);
    else snprintf(ic5_mode_str,8,"M%02X",ic5_mode);
  }
  // FE FE 98 E0 1C <00=RX 01=TX> FD
  else if(cmd==C_PTT_READ&&l>=6) {
    ic5_ptt=d[5]; last_change_src=1;
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

// ===================== SPE PROTOCOL =====================
void sp_send_bytes(uint8_t* data, int len) {
  uint8_t p = cfg.active_port;
  if(cfg.port_proto[p-1] != PROTO_SPE) return;
  if(p != 4) return;
  p3.write(data, len);
  p3.flush();
}

void sp_send_cmd(uint8_t cmd) {
  uint8_t pkt[] = {SPE_SYN, SPE_SYN, SPE_SYN, 0x01, cmd, cmd};
  sp_send_bytes(pkt, sizeof(pkt));
  // Serial.printf("[SPE] Cmd: 0x%02X\n", cmd);
}

void sp_poll() {
  if(!sp_is_active()) return;
  unsigned long now = millis();
  if(now - last_spe_poll < 2000) return;
  last_spe_poll = now;
  sp_send_cmd(SPE_CMD_STATUS);
  spe_poll_pending = true;
}

void sp_read() {
  uint8_t p = cfg.active_port;
  if(cfg.port_proto[p-1] != PROTO_SPE) return;
  if(p != 4) return;

  while(p3.available()) {
    uint8_t b = p3.read();
    if(spe_rxlen < SPE_BUF_LEN) { spe_rxbuf[spe_rxlen++] = b; }
  }
  if(spe_rxlen < 6) return;

  int syn_off = -1;
  for(int i = 0; i < spe_rxlen - 2; i++) {
    if(spe_rxbuf[i] == SPE_ACK && spe_rxbuf[i+1] == SPE_ACK && spe_rxbuf[i+2] == SPE_ACK) {
      syn_off = i; break;
    }
  }
  if(syn_off < 0) { spe_rxlen = 0; return; }

  int pay_len = spe_rxbuf[syn_off + 3];
  int total = syn_off + 4 + pay_len + 4;

  if(spe_rxlen < total) return;

  uint8_t* data_start = spe_rxbuf + syn_off + 4;
  uint16_t sum = 0;
  for(int i = 0; i < pay_len; i++) sum += data_start[i];

  if(data_start[pay_len + 2] != 0x0D || data_start[pay_len + 3] != 0x0A) { spe_rxlen = 0; return; }

  if(pay_len >= 67) {
    char buf[68];
    memcpy(buf, data_start, 67);
    buf[67] = 0;
    char* fields[19];
    int fc = 0;
    char* pp = buf;
    fields[fc++] = pp;
    while(*pp && fc < 19) {
      if(*pp == ',') { *pp = 0; fields[fc++] = pp + 1; }
      pp++;
    }
    if(fc >= 19) {
      strncpy(spe_id, fields[0], 3); spe_id[3] = 0;
      spe_op = (fields[1][0] == 'O');
      spe_tx = (fields[2][0] == 'T');
      spe_bank = fields[3][0];
      spe_input = atoi(fields[4]);
      spe_band = atoi(fields[5]);
      spe_ant = fields[6][0] - '0';
      spe_pwr_level = fields[8][0];
      spe_pout = atoi(fields[9]);
      spe_swr_atu = atof(fields[10]);
      spe_swr_ant = atof(fields[11]);
      spe_vpa = atof(fields[12]);
      spe_ipa = atof(fields[13]);
      spe_temp_up = atoi(fields[14]);
      spe_temp_lw = atoi(fields[15]);
      spe_temp_cmb = atoi(fields[16]);
      spe_warn = fields[17][0];
      spe_alarm = fields[18][0];
      Serial.printf("[SPE] %s OP=%c TX=%c %s Pout=%d SWR=%.2f V=%.1f I=%.1f T=%d\n",
        spe_id, fields[1][0], fields[2][0], fields[8], spe_pout, spe_swr_ant, spe_vpa, spe_ipa, spe_temp_up);
    }
  }
  spe_rxlen = 0;
  spe_poll_pending = false;
}

bool sp_is_active() {
  uint8_t p = cfg.active_port;
  if(p < 1 || p > 4) return false;
  return (cfg.port_proto[p-1] == PROTO_SPE);
}

void spe_set_op(bool on) {
  sp_send_cmd(on ? SPE_CMD_OPERATE : SPE_CMD_OFF);
  spe_op = on;
  addLog("SPE", on ? "OPERATE" : "STANDBY");
}

void spe_set_pwr() {
  sp_send_cmd(SPE_CMD_POWER);
  addLog("SPE", "Power toggle (L/M/H)");
}

void spe_set_input(int i) {
  if(i < 1 || i > 2) return;
  sp_send_cmd(SPE_CMD_INPUT);
  if(i == 2) { delay(80); sp_send_cmd(SPE_CMD_INPUT); }
  spe_input = i;
  addLog("SPE", "Input %d", i);
}

void spe_tune() {
  sp_send_cmd(SPE_CMD_TUNE);
  addLog("SPE", "TUNE");
}

void sp_init() {
  uint8_t p = cfg.active_port;
  if(cfg.port_proto[p-1] == PROTO_SPE) {
    p3.end();
    p3.begin(cfg.spe_baud[3], SERIAL_8N1, PORT4_RX, PORT4_TX);
    addLog("SPE","PORT4 RS232 %u baud", cfg.spe_baud[3]);
  }
}

// ===================== YAESU CAT =====================
HardwareSerial* ys_port() {
  uint8_t p = cfg.active_port;
  if(p < 1 || p > 4) return NULL;
  return gp(p);
}

void ys_send(const char* cmd) {
  auto p = ys_port();
  if(!p) return;
  int sl = strlen(cmd);
  if(sl >= YS_CMD_MAX) return;
  strcpy(ys_last_cmd, cmd);
  p->print(cmd);
  p->print(';');
  p->flush();
  ys_last_tx = millis();
  if(log_enabled.civ) Serial.printf("[YS] >> %s;\n", cmd);
}

void ys_read() {
  auto p = ys_port();
  if(!p) return;
  while(p->available() && ys_rxlen < YS_BUF_LEN - 1) {
    char c = p->read();
    if(c == ';') {
      ys_rxbuf[ys_rxlen] = 0;
      ys_parse();
      ys_rxlen = 0;
      ys_connected = true;
    } else if(c >= 0x20 && c <= 0x7E) {
      ys_rxbuf[ys_rxlen++] = c;
    }
  }
  if(ys_rxlen >= YS_BUF_LEN - 1) ys_rxlen = 0;
  // Timeout: se passou 500ms sem resposta, descarta buffer
  if(ys_rxlen > 0 && millis() - ys_last_tx > 500) ys_rxlen = 0;
}

void ys_parse() {
  char* buf = (char*)ys_rxbuf;
  int len = strlen(buf);
  if(len < 2) return;

  if(log_enabled.civ) Serial.printf("[YS] << %s\n", buf);

  // FA resposta: FA000030000-470000000;
  if(strncmp(buf, "FA", 2) == 0 && len >= 12) {
    char fstr[16]; memcpy(fstr, buf+2, 9); fstr[9] = 0;
    ic5_freq = atoll(fstr);
  }
  // MD resposta: MD0x;
  else if(strncmp(buf, "MD", 2) == 0 && len >= 4) {
    uint8_t m = (uint8_t)strtol(buf+3, NULL, 16);
    ic5_mode = m;
    const char* yn[] = {"","LSB","USB","CW-U","FM","AM","RTTY-L","CW-L","DATA-L","RTTY-U","DATA-FM","FM-N","DATA-U","AM-N","PSK"};
    if(m < sizeof(yn)/sizeof(yn[0]) && yn[m][0]) strcpy(ic5_mode_str, yn[m]);
    else snprintf(ic5_mode_str, 8, "M%02X", m);
  }
  // MX resposta: MX0; ou MX1;
  else if(strncmp(buf, "MX", 2) == 0 && len >= 3) {
    ic5_ptt = (buf[2] == '1');
  }
  // SM resposta: SM0xxx;
  else if(strncmp(buf, "SM", 2) == 0 && len >= 6) {
    ic5_smeter = atoi(buf+3);
  }
  // IF resposta (30 bytes): IFxxxxxxxxx...;
  else if(strncmp(buf, "IF", 2) == 0 && len >= 30) {
    // P1 (5 bytes): freq
    char fstr[16]; memcpy(fstr, buf+2, 9); fstr[9] = 0;
    ic5_freq = atoll(fstr);
    // P6 (1 byte): mode hex
    uint8_t m = (uint8_t)strtol(buf+27, NULL, 16);
    ic5_mode = m;
    const char* yn[] = {"","LSB","USB","CW-U","FM","AM","RTTY-L","CW-L","DATA-L","RTTY-U","DATA-FM","FM-N","DATA-U","AM-N","PSK"};
    if(m < sizeof(yn)/sizeof(yn[0]) && yn[m][0]) strcpy(ic5_mode_str, yn[m]);
    else snprintf(ic5_mode_str, 8, "M%02X", m);
  }
  // TX resposta: TX0; TX1; TX2;
  else if(strncmp(buf, "TX", 2) == 0 && len >= 3) {
    ic5_ptt = (buf[2] == '1' || buf[2] == '2');
  }
  // AG resposta: AG0xxx;
  else if(strncmp(buf, "AG", 2) == 0 && len >= 6) {
    if(buf[2] == '0') ic5_af = atoi(buf+3);
  }
  // RG resposta: RGxxx;
  else if(strncmp(buf, "RG", 2) == 0 && len >= 5) {
    ic5_rf = atoi(buf+2);
  }
}

void ys_poll() {
  if(!ys_is_active()) return;
  unsigned long now = millis();
  if(now - last_ys_poll < 1000) return;
  last_ys_poll = now;
  // Polling em sequencia: FA, SM0, MX, MD0
  static int step = 0;
  switch(step) {
    case 0: ys_send("FA"); break;
    case 1: ys_send("SM0"); break;
    case 2: ys_send("MX"); break;
    case 3: ys_send("MD0"); break;
  }
  step = (step + 1) % 4;
}

bool ys_is_active() {
  uint8_t p = cfg.active_port;
  if(p < 1 || p > 4) return false;
  return (cfg.port_proto[p-1] == PROTO_YAESU);
}

// ===================== KENWOOD CAT =====================
// Reusa o mesmo buffer e funcao de envio ASCII do Yaesu
// pois ambos usam formato: cmd + params + ;

void kw_send(const char* cmd) {
  auto p = ys_port();
  if(!p) return;
  p->print(cmd);
  p->print(';');
  p->flush();
  ys_last_tx = millis();
  if(log_enabled.civ) Serial.printf("[KW] >> %s;\n", cmd);
}

void kw_read() {
  auto p = ys_port();
  if(!p) return;
  while(p->available() && ys_rxlen < YS_BUF_LEN - 1) {
    char c = p->read();
    // Erro Kenwood: ?, E
    if(c == '?') { Serial.println("[KW] Erro: ? (syntax)"); ys_rxlen=0; continue; }
    if(c == 'E') { Serial.println("[KW] Erro: E (comm)"); ys_rxlen=0; continue; }
    if(c == 'O') { Serial.println("[KW] Erro: O (busy)"); ys_rxlen=0; continue; }
    if(c == ';') {
      ys_rxbuf[ys_rxlen] = 0;
      kw_parse();
      ys_rxlen = 0;
      ys_connected = true;
    } else if(c >= 0x20 && c <= 0x7E) {
      ys_rxbuf[ys_rxlen++] = c;
    }
  }
  if(ys_rxlen >= YS_BUF_LEN - 1) ys_rxlen = 0;
  if(ys_rxlen > 0 && millis() - ys_last_tx > 500) ys_rxlen = 0;
}

void kw_parse() {
  char* buf = (char*)ys_rxbuf;
  int len = strlen(buf);
  if(len < 2) return;
  if(log_enabled.civ) Serial.printf("[KW] << %s\n", buf);

  // FA resposta: FA00000000000; (11 digitos)
  if(strncmp(buf,"FA",2)==0 && len >= 14) {
    char f[16]; memcpy(f,buf+2,11); f[11]=0;
    ic5_freq = atoll(f);
  }
  // FB: mesma coisa
  else if(strncmp(buf,"FB",2)==0 && len >= 14) {
    char f[16]; memcpy(f,buf+2,11); f[11]=0;
    ic5_freq = atoll(f);
  }
  // MD resposta: MDx; (x=1-9)
  else if(strncmp(buf,"MD",2)==0 && len >= 3) {
    uint8_t m = buf[2]-'0';
    ic5_mode = m;
    const char* kn[]={"","LSB","USB","CW","FM","AM","FSK","CWR","","FSR"};
    if(m<10 && kn[m][0]) strcpy(ic5_mode_str,kn[m]);
    else snprintf(ic5_mode_str,8,"M%d",m);
  }
  // SM resposta: SM0xxxx; (0000-0020)
  else if(strncmp(buf,"SM",2)==0 && len >= 7) {
    int v = atoi(buf+3);
    ic5_smeter = v * 255 / 20; // normaliza 0-20 para 0-255
  }
  // PC resposta: PCxxx;
  else if(strncmp(buf,"PC",2)==0 && len >= 5) {
    ic5_pwr = atoi(buf+2) > 0 ? 1 : 0;
  }
  // IF resposta (37 chars): IFxxxxxxxxxxx.....;
  else if(strncmp(buf,"IF",2)==0 && len >= 30) {
    char f[16]; memcpy(f,buf+2,11); f[11]=0;
    ic5_freq = atoll(f);
    uint8_t m = buf[28]-'0'; // mode at pos 29 (0-indexed: 28)
    ic5_mode = m;
    const char* kn[]={"","LSB","USB","CW","FM","AM","FSK","CWR","","FSR"};
    if(m<10 && kn[m][0]) strcpy(ic5_mode_str,kn[m]);
    else snprintf(ic5_mode_str,8,"M%d",m);
    ic5_ptt = (buf[27] == '1'); // RX/TX at pos 28 (0-indexed: 27)
  }
  // AG resposta: AG0xxx;
  else if(strncmp(buf,"AG",2)==0 && len >= 6) {
    if(buf[2]=='0') ic5_af = atoi(buf+3);
  }
  // RG resposta: RGxxx;
  else if(strncmp(buf,"RG",2)==0 && len >= 5) {
    ic5_rf = atoi(buf+2);
  }
}

void kw_poll() {
  if(!kw_is_active()) return;
  unsigned long now = millis();
  if(now - last_ys_poll < 1000) return;
  last_ys_poll = now;
  static int step = 0;
  switch(step) {
    case 0: kw_send("FA"); break;
    case 1: kw_send("SM0"); break;
    case 2: kw_send("IF"); break; // IF ja inclui freq, modo, RX/TX
    case 3: kw_send("MD"); break;
  }
  step = (step + 1) % 4;
}

bool kw_is_active() {
  uint8_t p = cfg.active_port;
  if(p < 1 || p > 4) return false;
  return (cfg.port_proto[p-1] == PROTO_KENWOOD);
}

// ===================== FLEXRADIO CAT =====================
// Kenwood-compativel: ASCII cmd; com 11-digit frequency
// Reusa kw_send/kw_read (mesmo formato), parse proprio para modos

bool fr_is_active() {
  uint8_t p = cfg.active_port; if(p < 1 || p > 4) return false;
  return (cfg.port_proto[p-1] == PROTO_FLEXRADIO);
}

void fr_send(const char* cmd) {
  auto p = ys_port(); if(!p) return;
  p->print(cmd); p->print(';'); p->flush();
  ys_last_tx = millis();
  if(log_enabled.civ) Serial.printf("[FR] >> %s;\n", cmd);
}

void fr_read() {
  auto p = ys_port(); if(!p) return;
  while(p->available() && ys_rxlen < YS_BUF_LEN - 1) {
    char c = p->read();
    if(c == '?') { Serial.println("[FR] Erro: ?"); ys_rxlen=0; continue; }
    if(c == ';') {
      ys_rxbuf[ys_rxlen] = 0;
      fr_parse();
      ys_rxlen = 0;
      ys_connected = true;
    } else if(c >= 0x20 && c <= 0x7E) ys_rxbuf[ys_rxlen++] = c;
  }
  if(ys_rxlen >= YS_BUF_LEN - 1) ys_rxlen = 0;
  if(ys_rxlen > 0 && millis() - ys_last_tx > 500) ys_rxlen = 0;
}

void fr_parse() {
  char* buf = (char*)ys_rxbuf;
  int len = strlen(buf);
  if(len < 2) return;
  if(log_enabled.civ) Serial.printf("[FR] << %s\n", buf);

  // FA/FB: 11-digit frequency
  if((strncmp(buf,"FA",2)==0||strncmp(buf,"FB",2)==0) && len >= 14) {
    char f[16]; memcpy(f,buf+2,11); f[11]=0; ic5_freq = atoll(f);
  }
  // MD: mode
  else if(strncmp(buf,"MD",2)==0 && len >= 3) {
    int m = atoi(buf+2);
    const char* fn[]={"","LSB","USB","CWL","CWU","FM","AM","DIGU","","DIGL"};
    ic5_mode = m;
    if(m>=0&&m<10&&fn[m][0]) strcpy(ic5_mode_str,fn[m]);
    else snprintf(ic5_mode_str,8,"M%d",m);
  }
  // SM: S-meter (000-260 -> 0-255)
  else if(strncmp(buf,"SM",2)==0 && len >= 5) {
    int v = atoi(buf+2);
    ic5_smeter = v * 255 / 260;
  }
  // PC: Power
  else if(strncmp(buf,"PC",2)==0 && len >= 5) { ic5_pwr = atoi(buf+2) > 0 ? 1 : 0; }
  // IF: full status (same format as Kenwood)
  else if(strncmp(buf,"IF",2)==0 && len >= 30) {
    char f[16]; memcpy(f,buf+2,11); f[11]=0; ic5_freq = atoll(f);
    int m = buf[27]-'0';
    ic5_mode = m; ic5_ptt = (buf[26] == '1');
    const char* fn[]={"","LSB","USB","CWL","CWU","FM","AM","DIGU","","DIGL"};
    if(m>=0&&m<10&&fn[m][0]) strcpy(ic5_mode_str,fn[m]);
    else snprintf(ic5_mode_str,8,"M%d",m);
  }
  // TX: PTT
  else if(strncmp(buf,"TX",2)==0 && len >= 3) { ic5_ptt = (buf[2] == '1'); }
  // AG: AF gain
  else if(strncmp(buf,"AG",2)==0 && len >= 5) { ic5_af = atoi(buf+2); }
  // RG: RF gain (not Flex native but supported)
  else if(strncmp(buf,"RG",2)==0 && len >= 5) { ic5_rf = atoi(buf+2); }
  // ID
  else if(strncmp(buf,"ID",2)==0 && len >= 5) { ys_connected = true; }
}

void fr_poll() {
  if(!fr_is_active()) return;
  unsigned long now = millis();
  if(now - last_ys_poll < 1000) return;
  last_ys_poll = now;
  static int step = 0;
  switch(step) {
    case 0: fr_send("FA"); break;
    case 1: fr_send("SM"); break;
    case 2: fr_send("IF"); break;
    case 3: fr_send("MD"); break;
  }
  step = (step + 1) % 4;
}

// ===================== HAMPLUS HP603 =====================
void hp_send(uint8_t cmd) {
  auto p = ys_port(); if(!p) return;
  uint8_t buf[2] = {'K', cmd};
  p->write(buf, 2); p->flush();
  ys_last_tx = millis();
  if(log_enabled.civ) Serial.printf("[HP] >> K%02X\n", cmd);
}

void hp_read() {
  auto p = ys_port(); if(!p) return;
  while(p->available() && hp_rxlen < HP_BUF_LEN-1) {
    char c = p->read();
    if(c == 0x0A && hp_rxlen > 0) {
      hp_rxbuf[hp_rxlen] = 0;
      hp_parse();
      hp_rxlen = 0;
    } else if(c >= 0x20 || c == 0x0D) {
      hp_rxbuf[hp_rxlen++] = c;
    }
  }
  if(hp_rxlen >= HP_BUF_LEN-1) hp_rxlen = 0;
  if(hp_rxlen > 0 && millis() - ys_last_tx > 500) hp_rxlen = 0;
}

void hp_parse() {
  char* buf = (char*)hp_rxbuf;
  if(strncmp(buf, "ST=", 3) != 0 || hp_rxlen < 5) return;
  if(log_enabled.civ) Serial.printf("[HP] << %s\n", buf);
  uint8_t u2 = buf[3], u3 = buf[4];
  hp_antenna = (u2 & 0x3F); // bits 0-5
  hp_radio = (u2 & 0x40) ? 2 : ((u3 & 0x01) ? 3 : 1);
  if(u2 & 0x80) hp_radio = 2;
  if(u3 & 0x01) hp_radio = 3;
  hp_split = (u3 & 0x02) != 0;
  hp_ptt = (u3 & 0x04) != 0;
  ic5_ptt = hp_ptt;
}

void hp_poll() {
  if(!hp_is_active()) return;
  unsigned long now = millis();
  if(now - last_hp_poll < 2000) return;
  last_hp_poll = now;
  hp_send(0x00); // STATUS request
}

bool hp_is_active() {
  uint8_t p = cfg.active_port; if(p < 1 || p > 4) return false;
  return (cfg.port_proto[p-1] == PROTO_HAMPLUS);
}

// ===================== HAMPLUS TRANSLATOR =====================
// Bidirecional via CAT: Hamplus HP603 ↔ todos os protocolos
void translate_to_hp() {
  if(!hp_is_active()) return;
  static bool last_ptt = false;
  static uint64_t last_freq = 0;
  // PTT → Hamplus: forca STATUS update
  if(ic5_ptt != last_ptt) {
    last_ptt = ic5_ptt;
    hp_send(0x00);
  }
  // Frequencia → Hamplus: trigger STATUS (antena pode mudar conforme banda)
  if(ic5_freq != last_freq && ic5_freq > 100000) {
    last_freq = ic5_freq;
    hp_send(0x00);
  }
}

// Hamplus → outros: hp_parse() ja define:
//   hp_ptt → ic5_ptt → tradutores SPE/CAT reagem
//   hp_antenna → disponivel na UI
//   hp_radio → disponivel na UI
//   hp_split → disponivel na UI
void translate_hp_to_others() {
  if(!hp_is_active()) return;
  static int last_ant = -1;
  static int last_rad = -1;
  static bool last_spl = false;
  // Antena mudou → log
  if(hp_antenna != last_ant) {
    last_ant = hp_antenna;
    addLog("HP","Antena %d selecionada", hp_antenna);
  }
  // Radio mudou → log
  if(hp_radio != last_rad) {
    last_rad = hp_radio;
    addLog("HP","Radio %d selecionado", hp_radio);
  }
  // Split mudou → log
  if(hp_split != last_spl) {
    last_spl = hp_split;
    addLog("HP","Split %s", hp_split?"ON":"OFF");
  }
}

// ===================== PROTOCOL TRANSLATORS =====================
// Tradutor generico: IC-705 (CI-V via BLE) → porta CAT (Yaesu/Kenwood) ativa
void translate_civ_to_cat() {
  static uint64_t last_f = 0;
  static bool last_p = false;
  static uint8_t last_m = 0;
  uint8_t pt = cfg.port_proto[cfg.active_port-1];
  if(pt != PROTO_YAESU && pt != PROTO_KENWOOD && pt != PROTO_FLEXRADIO) return;

  // Frequencia
  if(ic5_freq != last_f && ic5_freq > 100000) {
    last_f = ic5_freq;
    if(pt == PROTO_YAESU) { char c[16]; snprintf(c,16,"FA%09llu",ic5_freq); ys_send(c); }
    else { char c[20]; snprintf(c,20,"FA%011llu",ic5_freq); kw_send(c); }
    addLog("CIV","Freq -> %s", pt==PROTO_YAESU?"YS":"KW");
  }
  // PTT
  if(ic5_ptt != last_p) {
    last_p = ic5_ptt;
    if(pt == PROTO_YAESU) ys_send(ic5_ptt?"MX1":"MX0");
    else kw_send(ic5_ptt?"TX0":"RX");
    addLog("CIV","PTT -> %s", pt==PROTO_YAESU?"YS":"KW");
  }
  // Modo
  if(ic5_mode != last_m) {
    last_m = ic5_mode;
    uint8_t ym = 2; // USB default
    switch(ic5_mode) { case 0: ym=1; break; case 1: ym=2; break; case 2: ym=5; break; case 3: ym=3; break; case 5: ym=4; break; }
    if(pt == PROTO_YAESU) { char c[8]; snprintf(c,8,"MD0%X",ym); ys_send(c); }
    else { char c[8]; snprintf(c,8,"MD%d",ym); kw_send(c); }
    addLog("CIV","Mode -> %s", pt==PROTO_YAESU?"YS":"KW");
  }
}
// Traduz comandos CI-V (BLE ou porta fisica) para SPE (PORT4)
void translate_civ_to_spe() {
  if(!sp_is_active()) return;
  if(!ic5con && !ic5civ && cfg.port_proto[cfg.active_port-1]!=PROTO_CIV) return;
  static bool last_ptt = false;
  if(ic5_ptt != last_ptt) {
    last_ptt = ic5_ptt;
    if(ic5_ptt) { spe_set_op(true); addLog("SPE","CIV PTT ON -> OPERATE"); }
    else { spe_set_op(false); addLog("SPE","CIV PTT OFF -> STANDBY"); }
  }
}

// Traduz comandos Yaesu CAT para SPE
void translate_ys_to_spe() {
  if(!sp_is_active()) return;
  if(!ys_is_active()) return;
  static bool last_ptt = false;
  if(ic5_ptt != last_ptt) {
    last_ptt = ic5_ptt;
    if(ic5_ptt) { spe_set_op(true); addLog("YS","PTT ON -> SPE OPERATE"); }
    else { spe_set_op(false); addLog("YS","PTT OFF -> SPE STANDBY"); }
  }
}

// Traduz comandos Kenwood CAT para SPE
void translate_kw_to_spe() {
  if(!sp_is_active()) return;
  if(!kw_is_active()) return;
  static bool last_ptt = false;
  if(ic5_ptt != last_ptt) {
    last_ptt = ic5_ptt;
    if(ic5_ptt) { spe_set_op(true); addLog("KW","PTT ON -> SPE OPERATE"); }
    else { spe_set_op(false); addLog("KW","PTT OFF -> SPE STANDBY"); }
  }
}

// Traduz CAT (Yaesu/Kenwood) → CI-V (IC-705 via BLE)
void translate_cat_to_civ() {
  uint8_t pt = cfg.port_proto[cfg.active_port-1];
  if(pt != PROTO_YAESU && pt != PROTO_KENWOOD && pt != PROTO_FLEXRADIO) return;
  if(!ic5con || !ic5civ || !ic5ch) return;
  static uint64_t last_f_civ = 0;
  static bool last_p_civ = false;
  static uint8_t last_m_civ = 0;

  if(ic5_freq != last_f_civ && ic5_freq > 100000) {
    last_f_civ = ic5_freq;
    // Envia CI-V FE FE A4 E0 00 <5 BCD LSB> FD
    uint8_t d[13]; int i=0;
    d[i++]=CIV_PRE; d[i++]=CIV_PRE; d[i++]=civ_ic705_addr; d[i++]=CIV_CTRL; d[i++]=0x00;
    uint64_t f=ic5_freq;
    for(int j=0;j<5;j++){ d[i++] = (((f%100)/10)<<4) | (f%10); f/=100; }
    d[i++]=CIV_END;
    ic5ch->writeValue(d,i,true);
    addLog("CIV","CAT Freq -> IC705");
  }
  if(ic5_ptt != last_p_civ) {
    last_p_civ = ic5_ptt;
    uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_PTT_ON,ic5_ptt?0x01:0x00,CIV_END};
    ic5ch->writeValue(d,sizeof(d),true);
    addLog("CIV","CAT PTT -> IC705");
  }
  if(ic5_mode != last_m_civ) {
    last_m_civ = ic5_mode;
    uint8_t d[]={CIV_PRE,CIV_PRE,civ_ic705_addr,CIV_CTRL,C_M_SET,ic5_mode,0x01,CIV_END};
    ic5ch->writeValue(d,sizeof(d),true);
    addLog("CIV","CAT Mode -> IC705");
  }
}

// ===================== BRIDGES =====================
void bridge_ic5p() {
  if(!ic5con||!ic5civ||!rxrdy||!cfg.cat_enabled) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  if(cfg.port_proto[p-1]>=PROTO_SPE){ rxrdy=false; return; }
  auto dp=gp(p);
  if(dp&&p!=4){ for(int i=0;i<rxlen;i++) dp->write(rxbuf[i]); }
  rxrdy=false;
}
void bridge_pic5() {
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  if(cfg.port_proto[p-1]>=PROTO_SPE) return;
  auto sp=gp(p);
  if(!sp||p==4||!sp->available()) return;
  uint8_t b[128]; int l=0;
  while(sp->available()&&l<128) b[l++]=sp->read();
  if(l>0){
    // Parse dados CI-V da porta fisica (atualiza ic5_*)
    if(!rxrdy) { memcpy(rxbuf,b,l); rxlen=l; rxrdy=true; proc_ic5(); }
    // Envia para IC-705 via BLE (se conectado)
    if(ic5con&&ic5civ&&ic5ch) ic5ch->writeValue(b,l);
  }
}
void bridge_nusp() {
  if(!nuscon||!nuslen) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  if(cfg.port_proto[p-1]>=PROTO_SPE){ nuslen=0; return; }
  auto dp=gp(p);
  if(dp&&p!=4){ for(int i=0;i<nuslen;i++) dp->write(nusbuf[i]); }
  nuslen=0;
}
void bridge_pnus() {
  if(!nuscon||!nustx) return;
  uint8_t p=cfg.cat_port?cfg.cat_port:cfg.active_port;
  if(cfg.port_proto[p-1]>=PROTO_SPE) return;
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
  const char* pn[] = {"CIV","SPE","YS","KW","HP","FR"};
  uint8_t pt = cfg.port_proto[p-1];
  Serial.printf("[CI-V] Porta: PORT %d Proto: %s\n",p,pt<6?pn[pt]:"?");
}
void rst_port(uint8_t p) {
  if(cfg.port_proto[p-1]==PROTO_SPE){ sp_init(); return; }
  if(cfg.port_proto[p-1]>=PROTO_YAESU){
    uint32_t bd = cfg.spe_baud[p-1] ? cfg.spe_baud[p-1] : YAESU_BAUD_DEFAULT;
    switch(p){
      case 1:p1.end();p1.begin(bd,SERIAL_8N1,PORT1_RX,PORT1_TX);break;
      case 2:p2.end();p2.begin(bd,SERIAL_8N1,PORT2_RX,PORT2_TX);break;
      case 3:p3.end();p3.begin(bd,SERIAL_8N1,PORT3_RX,PORT3_TX);break;
    }
    return;
  }
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
    Serial.println("=== SPE ===");
    Serial.println("spe_op <0|1>,spe_pwr,spe_input <1|2>,spe_tune,spe_sts");
  } else if(c=="sts"||c=="status"){
    if(sp_is_active()){
      Serial.printf("SPE %s: OP=%d TX=%d PWR=%c Pout=%d SWR=%.2f V=%.1f I=%.1f T=%d\n",spe_id,spe_op,spe_tx,spe_pwr_level,spe_pout,spe_swr_ant,spe_vpa,spe_ipa,spe_temp_up);
    }
    Serial.printf("IC705: %s CI-V:%s Freq:%llu Mode:%s PTT:%s PWR:%s\n",ic5con?"CON":"---",ic5civ?"OK":"---",ic5_freq,ic5_mode_str,ic5_ptt?"TX":"RX",ic5_pwr?"ON":"OFF");
    Serial.printf("AGC:%u PRE:%u ATT:%u RF:%u AF:%u S:%u Split:%u\n",ic5_agc,ic5_pre,ic5_att,ic5_rf,ic5_af,ic5_smeter,ic5_split);
    Serial.printf("AP: %s (%s) STA: %s\n",cfg.ap_ssid.c_str(),WiFi.softAPIP().toString().c_str(),sta_con?("CON "+WiFi.localIP().toString()).c_str():"---");
  } else if(c=="cfg"||c=="config"){
    Serial.printf("AP:%s STA:%s DHCP:%s BLE:%s CAT:%s Porta:%d\n",cfg.ap_ssid.c_str(),cfg.sta_ssid.c_str(),cfg.sta_dhcp?"S":"N",cfg.bt_name.c_str(),cfg.cat_enabled?"S":"N",cfg.cat_port);
    for(int i=0;i<4;i++){
      const char* pns[]={"CIV","SPE","YS","KW","HP","FR"};
      uint8_t pt=cfg.port_proto[i];
      Serial.printf("PORT%d: Proto=%s Baud=%u Addr=0x%02X\n",i+1,pt<6?pns[pt]:"?",cfg.civ_baud[i],cfg.civ_addr[i]);
    }
  } else if(c=="ports"){
    Serial.println("PORT1: RX16 TX17 (CIV)\nPORT2: RX18 TX19 (CIV)\nPORT3: RX20 TX21 (CIV)\nPORT4: RX14 TX15 (SPE RS232)");
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
  } else if(c.startsWith("spe_op ")){spe_set_op(atoi(c.substring(7).c_str())==1);}
  else if(c=="spe_pwr"){spe_set_pwr();}
  else if(c.startsWith("spe_input ")){spe_set_input(atoi(c.substring(10).c_str()));}
  else if(c=="spe_tune"){spe_tune();}
  else if(c=="spe_sts"){
    Serial.printf("SPE: %s OP=%d TX=%d Bank=%c Input=%d Band=%d Ant=%d PWR=%c Pout=%d SWR_ATU=%.2f SWR_ANT=%.2f V=%.1f I=%.1f T_up=%d T_lw=%d T_cmb=%d W=%c A=%c\n",
      spe_id, spe_op, spe_tx, spe_bank, spe_input, spe_band, spe_ant, spe_pwr_level,
      spe_pout, spe_swr_atu, spe_swr_ant, spe_vpa, spe_ipa, spe_temp_up, spe_temp_lw, spe_temp_cmb, spe_warn, spe_alarm);
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
  srv.on("/api/sysinfo",HTTP_GET,h_sysinfo);
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

// ===================== SYSINFO =====================
// Contadores para diagnostico
unsigned long req_count = 0;
unsigned long last_req_reset = 0;
unsigned long last_req_rate_check = 0;
unsigned long req_count_last = 0;
int wifi_util_pct = 0;
unsigned long loop_iters = 0;
unsigned long last_loop_check = 0;
unsigned long last_loop_iters = 0;
unsigned long max_loop_iters = 1;
int cpu_pct = 0;

void h_sysinfo() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  req_count++;
  StaticJsonDocument<1024> d;
  uint32_t ps=ESP.getPsramSize(), fs=ESP.getFreePsram();
  d["heap_total"]=ESP.getHeapSize(); d["heap_free"]=ESP.getFreeHeap();
  d["psram_total"]=ps; d["psram_free"]=fs;
  d["psram_pct"]=ps?(fs*100/ps):0;
  d["flash_size"]=ESP.getFlashChipSize();
  unsigned long sk_total=ESP.getFreeSketchSpace();
d["sketch_total"]=sk_total; d["sketch_size"]=ESP.getSketchSize(); d["sketch_free"]=sk_total-ESP.getSketchSize();
d["cores"]=ESP.getChipCores();
  d["chip"]=ESP.getChipModel(); d["chip_rev"]=ESP.getChipRevision();
  d["chip_temp"]=-127;
  d["cpu_mhz"]=ESP.getCpuFreqMHz();
  d["uptime_ms"]=millis();
  d["uptime_s"]=millis()/1000;
  d["wifi_rssi"]=WiFi.RSSI(); d["wifi_mac"]=WiFi.macAddress();
  d["wifi_ap_ip"]=WiFi.softAPIP().toString();
  d["wifi_sta_ip"]=sta_con?WiFi.localIP().toString():"";
  d["wifi_gw"]=sta_con?WiFi.gatewayIP().toString():"";
  d["wifi_mask"]=sta_con?WiFi.subnetMask().toString():"";
  d["wifi_dns1"]=sta_con?WiFi.dnsIP().toString():"";
  d["wifi_ssid"]=WiFi.SSID();
  d["cpu_pct"]=cpu_pct; d["wifi_util"]=wifi_util_pct; d["fw_ver"]=FIRMWARE_VERSION; d["req_count"]=req_count;
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

void h_root() {
  if(!checkAuth()){srv.sendHeader("Location","/login");srv.send(302,"text/plain","");return;}
  srv.send_P(200,"text/html",(PGM_P)R"rawliteral(
<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>CAT-Bridge CAT/CI-V/BT Gateway</title>
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
<h1>&#9881; CAT-Bridge CAT/CI-V/BT Gateway <span style="font-size:12px;color:#94a3b8">v1.0.4</span></h1>
<div class="tabs" id="tabbar">
<button class="tab active" data-tab="radio" onclick="st(this)">Radio</button>
<button class="tab" data-tab="ic705" onclick="st(this)">IC-705</button>
<button class="tab" data-tab="spe" onclick="st(this)">SPE</button>
<button class="tab" data-tab="hamplus" onclick="st(this)">Hamplus</button>
<button class="tab" data-tab="wifi" onclick="st(this)">WiFi</button>
<button class="tab" data-tab="bluetooth" onclick="st(this)">Bluetooth</button>
<button class="tab" data-tab="civ" onclick="st(this)">CAT / CI-V</button>
<button class="tab" data-tab="logs" onclick="st(this)">Logs</button>
<button class="tab" data-tab="admin" onclick="st(this)">Admin</button>
<button class="tab" data-tab="status" onclick="st(this)">Status</button>
</div>
<div id="tb-radio">
<h2>Painel de Controle Icom Radio</h2>
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
<button class="btn-outline btn-sm" onclick="civ('pwr',0)">Standby</button>
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
<div id="tb-spe" style="display:none">
<h2>SPE Expert Amplifier <span style="font-size:10px;color:#94a3b8">(PORT4 RS232)</span></h2>
<div class="card" style="background:#000;border:2px solid #1a3a5a;border-radius:6px;padding:12px;margin-bottom:8px">
<div style="background:#001020;border:1px solid #0a2a4a;border-radius:4px;padding:10px;font-family:'DS-Digital','Courier New',monospace">
<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #0a2a4a;padding-bottom:4px;margin-bottom:6px">
<span style="color:#4fc3f7;font-size:12px;font-weight:bold" id="s_spe_id">13K</span>
<span style="font-size:11px;padding:1px 6px;border-radius:2px;font-weight:bold" id="s_spe_op_display">STBY</span>
<span style="font-size:11px;padding:1px 6px;border-radius:2px;font-weight:bold" id="s_spe_tx_display">RX</span>
<span style="color:#94a3b8;font-size:11px" id="s_spe_bank_display">BNK A</span>
</div>
<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">
<div>
<span style="color:#555;font-size:9px">RF OUT</span>
<div><span style="color:#FFB300;font-size:32px;font-weight:bold;letter-spacing:2px" id="s_spe_pout_display">0</span><span style="color:#FFB300;font-size:16px"> W</span></div>
</div>
<div style="text-align:right">
<span style="color:#555;font-size:9px">PWR</span>
<div><span style="color:#4fc3f7;font-size:22px;font-weight:bold" id="s_spe_pwr_display">L</span></div>
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;border-top:1px solid #0a2a4a;border-bottom:1px solid #0a2a4a;padding:4px 0;margin:4px 0">
<div><span style="color:#555;font-size:8px">SWR ATU</span><div style="color:#4fc3f7;font-size:16px;font-weight:bold" id="s_spe_swr_atu_display">0.00</div></div>
<div><span style="color:#555;font-size:8px">SWR ANT</span><div style="color:#4fc3f7;font-size:16px;font-weight:bold" id="s_spe_swr_display">0.00</div></div>
<div><span style="color:#555;font-size:8px">V PA</span><div style="color:#10b981;font-size:16px;font-weight:bold" id="s_spe_vpa_display">0.0</div></div>
<div><span style="color:#555;font-size:8px">I PA</span><div style="color:#10b981;font-size:16px;font-weight:bold" id="s_spe_ipa_display">0.0</div></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;padding:2px 0">
<div><span style="color:#555;font-size:8px">BAND</span><div style="color:#e2e8f0;font-size:13px;font-weight:bold" id="s_spe_band_display">---</div></div>
<div><span style="color:#555;font-size:8px">ANT</span><div style="color:#e2e8f0;font-size:13px;font-weight:bold" id="s_spe_ant_display">-</div></div>
<div><span style="color:#555;font-size:8px">INPUT</span><div style="color:#e2e8f0;font-size:13px;font-weight:bold" id="s_spe_input_display">1</div></div>
<div><span style="color:#555;font-size:8px">TEMP</span><div style="color:#f87171;font-size:13px;font-weight:bold" id="s_spe_temp_display">0</div></div>
</div>
<div id="spe_alarm_box_display" style="display:none;margin-top:4px;padding:3px 6px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;border-radius:2px;font-size:11px;color:#ef4444;text-align:center;font-weight:bold">
ALARM: <span id="spe_alarm_txt_display"></span>
</div>
<div id="spe_warn_box_display" style="display:none;margin-top:2px;padding:3px 6px;background:rgba(255,179,0,0.15);border:1px solid #FFB300;border-radius:2px;font-size:11px;color:#FFB300;text-align:center;font-weight:bold">
WARN: <span id="spe_warn_txt_display"></span>
</div>
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
<div class="card" style="padding:8px">
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px">
<button class="btn-sm" onclick="speCmd('input',1)">Input</button>
<button class="btn-sm" onclick="speCmd('lm','')">&larr; L</button>
<button class="btn-sm" onclick="speCmd('lp','')">L &rarr;</button>
<button class="btn-sm" onclick="speCmd('ant','')">Antena</button>
<button class="btn-sm" onclick="speCmd('cm','')">&larr; C</button>
<button class="btn-sm" onclick="speCmd('cp','')">C &rarr;</button>
<button class="btn-sm" onclick="speCmd('bm','')">&larr; Band-</button>
<button class="btn-sm" onclick="speCmd('bp','')">Band+ &rarr;</button>
<button class="btn-sm" onclick="speCmd('tune','')">Tunner</button>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-top:3px">
<div style="text-align:center"><span id="spe_led_al" class="spe-led" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#333;vertical-align:middle"></span> <span style="font-size:9px;color:#94a3b8">AL</span></div>
<div style="text-align:center"><span id="spe_led_tune" class="spe-led" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#333;vertical-align:middle"></span> <span style="font-size:9px;color:#94a3b8">Tune</span></div>
<div style="text-align:center"><span id="spe_led_off" class="spe-led" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;vertical-align:middle"></span> <span style="font-size:9px;color:#94a3b8">Off</span></div>
</div>
</div>
<div class="card" style="padding:8px">
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px">
<button class="btn-sm" onclick="speCmd('left','')">&larr; &uarr;</button>
<button class="btn-sm" onclick="speCmd('up','')">&darr; &rarr;</button>
<button class="btn-sm" onclick="speCmd('op',1)">On</button>
<button class="btn-sm" onclick="speCmd('catkey','')">Cat</button>
<button class="btn-sm" onclick="speCmd('disp','')">Disp</button>
<button class="btn-sm" onclick="speCmd('op',0)">Off</button>
<button class="btn-sm" onclick="speCmd('setkey','')">Set</button>
<button class="btn-sm" onclick="speCmd('spwr',1)">PWR</button>
<button class="btn-sm" onclick="speCmd('op',1)">OP</button>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-top:3px">
<div style="text-align:center"><span id="spe_led_on" class="spe-led" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#333;vertical-align:middle"></span> <span style="font-size:9px;color:#94a3b8">ON</span></div>
<div style="text-align:center"><span id="spe_led_op" class="spe-led" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#333;vertical-align:middle"></span> <span style="font-size:9px;color:#94a3b8">OP</span></div>
<div style="text-align:center"><span id="spe_led_tx" class="spe-led" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#333;vertical-align:middle"></span> <span style="font-size:9px;color:#94a3b8">TX</span></div>
</div>
</div>
</div>
</div>
<div id="tb-hamplus" style="display:none"><h2>Hamplus</h2>
<!-- LEDs + Rotor row -->
<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
<div class="card" style="flex:1;min-width:120px;padding:8px;display:flex;gap:8px;justify-content:center">
<div style="text-align:center"><span id="hp_led_pwr" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#10b981"></span><div style="font-size:9px;color:#94a3b8;margin-top:2px">Power</div></div>
<div style="text-align:center"><span id="hp_led_send" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#333"></span><div style="font-size:9px;color:#94a3b8;margin-top:2px">Send</div></div>
<div style="text-align:center"><span id="hp_led_split" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#333"></span><div style="font-size:9px;color:#94a3b8;margin-top:2px">Split</div></div>
</div>
<div class="card" style="flex:2;min-width:160px;padding:8px">
<div style="display:flex;align-items:center;gap:6px">
<div style="background:#001020;border:1px solid #0a2a4a;border-radius:4px;padding:6px;text-align:center;font-family:'DS-Digital',monospace;flex:1">
<span style="color:#555;font-size:8px">GRAUS</span>
<div><span id="hp_rotor_dir" style="color:#FFB300;font-size:28px;font-weight:bold;letter-spacing:2px">000</span><span style="color:#555;font-size:10px">&deg;</span></div>
</div>
<div style="display:flex;flex-direction:column;gap:3px">
<button class="btn-sm hp-rotor-btn" onclick="hpRotor(1)">Rotor 1</button>
<button class="btn-sm hp-rotor-btn" onclick="hpRotor(2)">Rotor 2</button>
</div>
<div style="display:flex;flex-direction:column;gap:3px">
<button class="btn-sm" onclick="hpDir(1)">&uarr;</button>
<button class="btn-sm" onclick="hpDir(-1)">&darr;</button>
</div>
</div>
</div>
</div>
<!-- Chave de Antena -->
<div class="card" style="padding:8px"><h2>Chave de Antena</h2>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px">
<button class="btn-sm hp-ant-btn" onclick="hpAnt(1)">ANT 1</button><button class="btn-sm hp-ant-btn" onclick="hpAnt(2)">ANT 2</button>
<button class="btn-sm hp-ant-btn" onclick="hpAnt(3)">ANT 3</button><button class="btn-sm hp-ant-btn" onclick="hpAnt(4)">ANT 4</button>
<button class="btn-sm hp-ant-btn" onclick="hpAnt(5)">ANT 5</button><button class="btn-sm hp-ant-btn" onclick="hpAnt(6)">ANT 6</button>
<button class="btn-sm hp-ant-btn btn-outline" onclick="hpAnt(7)" style="opacity:0.5">ANT 7</button>
<button class="btn-sm hp-ant-btn btn-outline" onclick="hpAnt(8)" style="opacity:0.5">ANT 8</button>
<button class="btn-sm hp-ant-btn btn-outline" onclick="hpAnt(9)" style="opacity:0.5">ANT 9</button>
<button class="btn-sm hp-ant-btn btn-outline" onclick="hpAnt(10)" style="opacity:0.5">ANT 10</button>
</div>
</div>
<!-- Chave de Radio -->
<div class="card" style="padding:8px"><h2>Chave de Radio</h2>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px">
<button class="btn-sm hp-radio-btn" onclick="hpRadio(1)">Radio 1</button><button class="btn-sm hp-radio-btn" onclick="hpRadio(2)">Radio 2</button>
<button class="btn-sm hp-radio-btn" onclick="hpRadio(3)">Radio 3</button>
<button class="btn-sm hp-radio-btn btn-outline" onclick="hpRadio(4)" style="opacity:0.5">Radio 4</button>
<button class="btn-sm hp-radio-btn btn-outline" onclick="hpRadio(5)" style="opacity:0.5">Radio 5</button>
</div>
</div>
</div>
<div id="tb-wifi" style="display:none"><h2>WiFi</h2>
<div class="card">
<h2>AP</h2><label>SSID</label><input type="text" id="aps"><label>Senha</label><input type="password" id="app"><button onclick="sAP()">Salvar AP</button>
</div>
<div class="card">
<h2>STA</h2><label>SSID</label><input type="text" id="stas"><label>Senha</label><input type="password" id="stap"><button onclick="sSTA()">Salvar STA</button>
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
<div class="card"><h2>Dispositivo</h2>
<p style="font-size:11px;color:#94a3b8;margin-bottom:6px">Reinicia o ESP32 ou restaura todas as configura&ccedil;&otilde;es para o padr&atilde;o de f&aacute;brica.</p>
<div style="display:flex;gap:4px;flex-wrap:wrap">
<button class="btn-outline btn-sm" onclick="rebootESP()">Reiniciar</button>
<button class="btn-red btn-sm" onclick="factoryReset()">Reset de F&aacute;brica</button>
</div>
</div>
<div class="card"><h2>Atualização de Firmware</h2>
<p style="font-size:11px;color:#94a3b8">Versão atual: <strong id="fwver">v1.0.4</strong></p>
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
<div id="tb-status" style="display:none">
<h2>Status do Sistema</h2>
<div class="card">
<h2>Hardware</h2>
<div class="grid3">
<div class="gitem"><div class="glabel">Chip</div><div class="gval" id="s_chip">---</div></div>
<div class="gitem"><div class="glabel">CPU</div><div class="gval" id="s_cpu">--- MHz</div></div>
<div class="gitem"><div class="glabel">Temp</div><div class="gval" id="s_temp">N/A</div></div>
<div class="gitem"><div class="glabel">N&uacute;cleos</div><div class="gval" id="s_cores">---</div></div>
<div class="gitem"><div class="glabel">Firmware</div><div class="gval" id="s_fwver">---</div></div>
<div class="gitem"><div class="glabel">Sketch</div><div class="gval" style="font-size:11px" id="s_sketch">---</div></div>
</div>
</div>
<div class="card">
<h2>Mem&oacute;ria</h2>
<div class="grid3">
<div class="gitem"><div class="glabel">RAM</div><div class="gval" id="s_ram">---</div></div>
<div class="gitem"><div class="glabel">PSRAM</div><div class="gval" id="s_psram">---</div></div>
<div class="gitem"><div class="glabel">Flash</div><div class="gval" id="s_flash">---</div></div>
</div>
<div style="margin-top:6px"><label>RAM <span id="s_ram_pct" style="float:right;color:#4fc3f7">0%</span></label>
<div style="height:8px;background:#1a2a3a;border-radius:4px"><div id="s_ram_bar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#4fc3f7,#FFB300,#ef4444);border-radius:4px;transition:width .3s"></div></div></div>
<div style="margin-top:4px"><label>PSRAM <span id="s_psram_pct" style="float:right;color:#4fc3f7">0%</span></label>
<div style="height:8px;background:#1a2a3a;border-radius:4px"><div id="s_psram_bar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#4fc3f7,#FFB300,#ef4444);border-radius:4px;transition:width .3s"></div></div></div>
</div>
<div class="card">
<h2>Processador</h2>
<div><label>CPU: <span id="s_cpu_pct" style="color:#4fc3f7;font-weight:bold">0%</span></label>
<div style="height:12px;background:#1a2a3a;border-radius:6px;overflow:hidden">
<div id="s_cpu_bar" style="height:100%;width:0%;border-radius:6px;transition:width .3s"></div>
</div></div>
</div>
<div class="card">
<h2>WiFi</h2>
<div><label>Utiliza&ccedil;&atilde;o: <span id="s_wifi_util_pct" style="color:#4fc3f7;font-weight:bold">0%</span></label>
<div style="height:12px;background:#1a2a3a;border-radius:6px;overflow:hidden">
<div id="s_wifi_bar" style="height:100%;width:0%;border-radius:6px;transition:width .3s"></div>
</div></div>
</div>
<div class="card">
<h2>Rede</h2>
<div class="grid3">
<div class="gitem"><div class="glabel">AP IP</div><div class="gval" style="font-size:12px" id="s_apip">---</div></div>
<div class="gitem"><div class="glabel">STA IP</div><div class="gval" style="font-size:12px" id="s_staip">---</div></div>
<div class="gitem"><div class="glabel">MAC</div><div class="gval" style="font-size:12px" id="s_mac">---</div></div>
<div class="gitem"><div class="glabel">Gateway</div><div class="gval" style="font-size:12px" id="s_gw">---</div></div>
<div class="gitem"><div class="glabel">M&aacute;scara</div><div class="gval" style="font-size:12px" id="s_mask">---</div></div>
<div class="gitem"><div class="glabel">DNS</div><div class="gval" style="font-size:12px" id="s_dns">---</div></div>
</div>
<div class="grid3" style="margin-top:4px">
<div class="gitem"><div class="glabel">RSSI</div><div class="gval" id="s_rssi">---</div></div>
<div class="gitem"><div class="glabel">SSID</div><div class="gval" style="font-size:12px" id="s_ssid">---</div></div>
<div class="gitem"><div class="glabel">Requisi&ccedil;&otilde;es</div><div class="gval" id="s_req">---</div></div>
</div>
</div>
<div class="card">
<h2>Pinagem</h2>
<div style="font-size:10px;font-family:monospace">
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a;color:#555">
<span>Pino</span><span>Nome</span><span>Fun&ccedil;&atilde;o</span><span>Dir.</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>2</span><span style="color:#555">GPIO2</span><span>LED indicador</span><span>OUT</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>14</span><span style="color:#555">GPIO14</span><span>PORT4 RX (SPE RS232)</span><span>IN</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>15</span><span style="color:#555">GPIO15</span><span>PORT4 TX (SPE RS232)</span><span>OUT</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>16</span><span style="color:#555">GPIO16</span><span>PORT1 RX (CI-V/CAT)</span><span>IN</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>17</span><span style="color:#555">GPIO17</span><span>PORT1 TX (CI-V/CAT)</span><span>OUT</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>18</span><span style="color:#555">GPIO18</span><span>PORT2 RX (CI-V/CAT)</span><span>IN</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>19</span><span style="color:#555">GPIO19</span><span>PORT2 TX (CI-V/CAT)</span><span>OUT</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>20</span><span style="color:#555">GPIO20</span><span>PORT3 RX (CI-V/CAT)</span><span>IN</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>21</span><span style="color:#555">GPIO21</span><span>PORT3 TX (CI-V/CAT)</span><span>OUT</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0;border-bottom:1px solid #1a2a3a">
<span>43</span><span style="color:#555">GPIO43</span><span>USB CDC (Console)</span><span>I/O</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:2px;padding:2px 0">
<span>44</span><span style="color:#555">GPIO44</span><span>USB CDC (Console)</span><span>I/O</span></div>
</div>
</div>
<div class="card">
<h2>Uptime</h2>
<div class="gval" style="text-align:center;font-size:18px" id="s_uptime">---</div>
</div>
</div>
<div id="tb-civ" style="display:none"><h2>CAT / CI-V</h2>
<button onclick="sCIV()" style="margin-bottom:8px">Salvar Todas</button>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="ports-grid">
<div class="card" style="padding:8px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
<strong style="color:#FFB300;font-size:12px">PORT 1</strong>
<label style="font-size:10px;margin:0"><input type="checkbox" class="pe" data-idx="0" checked> Enable</label></div>
<label style="font-size:9px">Protocolo</label>
<select class="pp" data-idx="0" onchange="protoChange2(this,0)" style="font-size:10px;padding:3px 4px">
<option value="0">CI-V</option><option value="1">SPE</option><option value="2">Yaesu</option><option value="3">Kenwood</option><option value="4">Hamplus</option><option value="5">FlexRadio</option></select>
<label style="font-size:9px">Baud</label>
<select class="pb" data-idx="0" style="font-size:10px;padding:3px 4px">
<option value="9600">9600</option><option value="19200" selected>19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select>
<div class="civ-addr-row-0"><label style="font-size:9px">Endere&ccedil;o CI-V</label>
<select class="pa" data-idx="0" style="font-size:10px;padding:3px 4px">
<option value="0x94">IC-7300</option><option value="0x18">IC-7100</option><option value="0x76">IC-7610</option>
<option value="0x98" selected>IC-705</option><option value="0x88">IC-9700</option><option value="0x70">IC-7000</option>
<option value="0x48">IC-706</option><option value="0x39">IC-2730</option></select></div></div>
<div class="card" style="padding:8px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
<strong style="color:#FFB300;font-size:12px">PORT 2</strong>
<label style="font-size:10px;margin:0"><input type="checkbox" class="pe" data-idx="1" checked> Enable</label></div>
<label style="font-size:9px">Protocolo</label>
<select class="pp" data-idx="1" onchange="protoChange2(this,1)" style="font-size:10px;padding:3px 4px">
<option value="0">CI-V</option><option value="1">SPE</option><option value="2">Yaesu</option><option value="3">Kenwood</option><option value="4">Hamplus</option><option value="5">FlexRadio</option></select>
<label style="font-size:9px">Baud</label>
<select class="pb" data-idx="1" style="font-size:10px;padding:3px 4px">
<option value="9600">9600</option><option value="19200" selected>19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select>
<div class="civ-addr-row-1"><label style="font-size:9px">Endere&ccedil;o CI-V</label>
<select class="pa" data-idx="1" style="font-size:10px;padding:3px 4px">
<option value="0x94">IC-7300</option><option value="0x18">IC-7100</option><option value="0x76">IC-7610</option>
<option value="0x98" selected>IC-705</option><option value="0x88">IC-9700</option><option value="0x70">IC-7000</option>
<option value="0x48">IC-706</option><option value="0x39">IC-2730</option></select></div></div>
<div class="card" style="padding:8px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
<strong style="color:#FFB300;font-size:12px">PORT 3</strong>
<label style="font-size:10px;margin:0"><input type="checkbox" class="pe" data-idx="2" checked> Enable</label></div>
<label style="font-size:9px">Protocolo</label>
<select class="pp" data-idx="2" onchange="protoChange2(this,2)" style="font-size:10px;padding:3px 4px">
<option value="0">CI-V</option><option value="1">SPE</option><option value="2">Yaesu</option><option value="3">Kenwood</option><option value="4">Hamplus</option><option value="5">FlexRadio</option></select>
<label style="font-size:9px">Baud</label>
<select class="pb" data-idx="2" style="font-size:10px;padding:3px 4px">
<option value="9600">9600</option><option value="19200" selected>19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select>
<div class="civ-addr-row-2"><label style="font-size:9px">Endere&ccedil;o CI-V</label>
<select class="pa" data-idx="2" style="font-size:10px;padding:3px 4px">
<option value="0x94">IC-7300</option><option value="0x18">IC-7100</option><option value="0x76">IC-7610</option>
<option value="0x98" selected>IC-705</option><option value="0x88">IC-9700</option><option value="0x70">IC-7000</option>
<option value="0x48">IC-706</option><option value="0x39">IC-2730</option></select></div></div>
<div class="card" style="padding:8px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
<strong style="color:#FFB300;font-size:12px">PORT 4</strong>
<label style="font-size:10px;margin:0"><input type="checkbox" class="pe" data-idx="3" checked> Enable</label></div>
<label style="font-size:9px">Protocolo</label>
<select class="pp" data-idx="3" onchange="protoChange2(this,3)" style="font-size:10px;padding:3px 4px">
<option value="0">CI-V</option><option value="1">SPE</option><option value="2">Yaesu</option><option value="3">Kenwood</option><option value="4">Hamplus</option><option value="5">FlexRadio</option></select>
<label style="font-size:9px">Baud</label>
<select class="pb" data-idx="3" style="font-size:10px;padding:3px 4px">
<option value="9600">9600</option><option value="19200" selected>19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select>
<div class="civ-addr-row-3"><label style="font-size:9px">Endere&ccedil;o CI-V</label>
<select class="pa" data-idx="3" style="font-size:10px;padding:3px 4px">
<option value="0x94">IC-7300</option><option value="0x18">IC-7100</option><option value="0x76">IC-7610</option>
<option value="0x98" selected>IC-705</option><option value="0x88">IC-9700</option><option value="0x70">IC-7000</option>
<option value="0x48">IC-706</option><option value="0x39">IC-2730</option></select></div></div>
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
if(tab=='spe'){carregarSPE();}
if(tab=='hamplus'){carregarHP();}
if(tab=='wifi'){carregar();listarRedes();carregarRedes();}
if(tab=='logs')carregarLogPref();
if(tab=='admin')carregarUsers();
if(tab=='status'){
carregarSysinfo();
if(window._stInt)clearInterval(window._stInt);
window._stInt=setInterval(carregarSysinfo,1000);
} else {
if(window._stInt){clearInterval(window._stInt);window._stInt=null;}
}
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
function carregarSPE(){
var x=new XMLHttpRequest();
x.open('GET','/api/status',true);
x.onload=function(){
try{
var d=JSON.parse(x.responseText);
if(!d.spe_active){
var v='---';['s_spe_id','s_spe_id2'].forEach(function(i){var e=document.getElementById(i);if(e)e.textContent=v;});
['s_spe_pout','s_spe_pout2','s_spe_pout_display'].forEach(function(i){var e=document.getElementById(i);if(e)e.textContent=v;});
return;
}
var bands=['160m','80m','60m','40m','30m','20m','17m','15m','12m','10m','6m','4m'];
var bi=d.spe_band;var bn=(bi>=0&&bi<bands.length)?bands[bi]:'B'+bi;
var pout=d.spe_pout||0;
document.getElementById('s_spe_id').textContent=d.spe_id||'13K';
var opEl=document.getElementById('s_spe_op_display');
if(d.spe_op){opEl.textContent='OPERATE';opEl.style.color='#10b981';opEl.style.background='rgba(16,185,129,0.2)';}
else{opEl.textContent='STBY';opEl.style.color='#ef4444';opEl.style.background='rgba(239,68,68,0.2)';}
var txEl=document.getElementById('s_spe_tx_display');
if(d.spe_tx){txEl.textContent='TX';txEl.style.color='#ef4444';txEl.style.background='rgba(239,68,68,0.2)';}
else{txEl.textContent='RX';txEl.style.color='#10b981';txEl.style.background='rgba(16,185,129,0.2)';}
document.getElementById('s_spe_bank_display').textContent='BNK '+d.spe_bank;
document.getElementById('s_spe_pout_display').textContent=pout;
document.getElementById('s_spe_pwr_display').textContent=d.spe_pwr_level||'L';
document.getElementById('s_spe_swr_atu_display').textContent=(d.spe_swr_atu||0).toFixed(2);
document.getElementById('s_spe_swr_display').textContent=(d.spe_swr_ant||0).toFixed(2);
document.getElementById('s_spe_vpa_display').textContent=(d.spe_vpa||0).toFixed(1);
document.getElementById('s_spe_ipa_display').textContent=(d.spe_ipa||0).toFixed(1);
document.getElementById('s_spe_band_display').textContent=bn;
document.getElementById('s_spe_ant_display').textContent=d.spe_ant||'-';
document.getElementById('s_spe_input_display').textContent=d.spe_input||1;
document.getElementById('s_spe_temp_display').textContent=(d.spe_temp_up||0)+'C';
var alBox=document.getElementById('spe_alarm_box_display'),alTxt=document.getElementById('spe_alarm_txt_display');
if(d.spe_alarm&&d.spe_alarm!='N'&&d.spe_alarm!='n'){alBox.style.display='block';alTxt.textContent=d.spe_alarm;}
else alBox.style.display='none';
var wrBox=document.getElementById('spe_warn_box_display'),wrTxt=document.getElementById('spe_warn_txt_display');
if(d.spe_warn&&d.spe_warn!='N'&&d.spe_warn!='n'){wrBox.style.display='block';wrTxt.textContent=d.spe_warn;}
else wrBox.style.display='none';
document.getElementById('s_spe_id2').textContent=d.spe_id||'---';
document.getElementById('s_spe_op2').innerHTML=d.spe_op?'<span class="badge bg-green">OPERATE</span>':'<span class="badge bg-red">STBY</span>';
document.getElementById('s_spe_tx2').innerHTML=d.spe_tx?'<span class="badge bg-red">TX</span>':'<span class="badge bg-green">RX</span>';
document.getElementById('s_spe_pout2').textContent=pout+' W';
document.getElementById('s_spe_swr2').textContent=(d.spe_swr_ant||0).toFixed(2);
document.getElementById('s_spe_pwr2').textContent=d.spe_pwr_level||'---';
document.getElementById('s_spe_vpa2').textContent=(d.spe_vpa||0).toFixed(1)+'V';
document.getElementById('s_spe_ipa2').textContent=(d.spe_ipa||0).toFixed(1)+'A';
document.getElementById('s_spe_temp2').textContent=(d.spe_temp_up||0)+' C';
var ledOn=function(id,on){var e=document.getElementById(id);if(e)e.style.background=on?'#10b981':'#333';};
var al=d.spe_alarm||'N';ledOn('spe_led_al',al!='N'&&al!='n');
ledOn('spe_led_off',!d.spe_op);
ledOn('spe_led_on',d.spe_op);
ledOn('spe_led_op',d.spe_op);
ledOn('spe_led_tx',d.spe_tx);
var wn=d.spe_warn||'N';ledOn('spe_led_tune',wn=='W'||wn=='K');
}catch(e){}
};
x.send();
}
function speCmd(c,v){
var d={};d[c]=v;
var x=new XMLHttpRequest();
x.open('POST','/api/civ',true);
x.setRequestHeader('Content-Type','application/json');
x.onload=function(){try{var r=JSON.parse(x.responseText);toast(r.success?'OK':'Erro',r.success?'ok':'err');}catch(e){toast('Erro','err');}};
x.send(JSON.stringify(d));
setTimeout(carregarSPE,500);
}
function carregarSysinfo(){
var x=new XMLHttpRequest();
x.open('GET','/api/sysinfo',true);
x.onload=function(){
try{
var d=JSON.parse(x.responseText);
document.getElementById('s_chip').textContent=(d.chip||'?')+' rev.'+(d.chip_rev||0);
document.getElementById('s_cpu').textContent=(d.cpu_mhz||'?')+' MHz';
document.getElementById('s_temp').textContent=(d.chip_temp&&d.chip_temp>-127)?d.chip_temp+' C':'N/A';
var fw=d.fw_ver;
if(!fw){var h1s=document.querySelector('h1 span');if(h1s)fw=h1s.textContent;}
document.getElementById('s_fwver').textContent=fw||'---';
document.getElementById('s_cores').textContent=(d.cores||'?')+' nucleos';
document.getElementById('s_sketch').textContent=fmtBytes(d.sketch_total)+' total / '+fmtBytes(d.sketch_size)+' usado / '+fmtBytes(d.sketch_free)+' livre';
var ramUso=((d.heap_total||1)-(d.heap_free||0))/(d.heap_total||1)*100;
document.getElementById('s_ram').textContent=fmtBytes(d.heap_free)+' / '+fmtBytes(d.heap_total);
document.getElementById('s_ram_bar').style.width=Math.round(ramUso)+'%';
document.getElementById('s_ram_pct').textContent=Math.round(ramUso)+'%';
var psUso=((d.psram_total||1)-(d.psram_free||0))/(d.psram_total||1)*100;
document.getElementById('s_psram').textContent=(d.psram_total?fmtBytes(d.psram_free)+' / '+fmtBytes(d.psram_total):'N/A');
if(d.psram_total){document.getElementById('s_psram_bar').style.width=Math.round(psUso)+'%';document.getElementById('s_psram_pct').textContent=Math.round(psUso)+'%';}else{document.getElementById('s_psram_bar').style.width='0%';document.getElementById('s_psram_pct').textContent='N/A';}
document.getElementById('s_flash').textContent=fmtBytes(d.sketch_free)+' livre ('+fmtBytes(d.flash_size)+')';
document.getElementById('s_apip').textContent=d.wifi_ap_ip||'---';
document.getElementById('s_staip').textContent=d.wifi_sta_ip||'---';
document.getElementById('s_mac').textContent=d.wifi_mac||'---';
document.getElementById('s_gw').textContent=d.wifi_gw||'---';
document.getElementById('s_mask').textContent=d.wifi_mask||'---';
document.getElementById('s_dns').textContent=d.wifi_dns1||'---';
document.getElementById('s_rssi').textContent=d.wifi_rssi?d.wifi_rssi+' dBm':'---';
document.getElementById('s_ssid').textContent=d.wifi_ssid||'---';
document.getElementById('s_req').textContent=d.req_count||0;
var cp=d.cpu_pct||0;
document.getElementById('s_cpu_pct').textContent=cp+'%';
var bar=document.getElementById('s_cpu_bar');
bar.style.width=cp+'%';
bar.style.background=cp<30?'#10b981':cp<60?'#FFB300':'#ef4444';
var wu=d.wifi_util||0;
document.getElementById('s_wifi_util_pct').textContent=wu+'%';
var wbar=document.getElementById('s_wifi_bar');
if(wbar){wbar.style.width=wu+'%';wbar.style.background=wu<20?'#10b981':wu<50?'#4fc3f7':'#FFB300';}
var up=d.uptime_s||0;
var dd=Math.floor(up/86400);up%=86400;
var hh=Math.floor(up/3600);up%=3600;
var mm=Math.floor(up/60);var ss=up%60;
document.getElementById('s_uptime').textContent=dd+'d '+('0'+hh).slice(-2)+'h '+('0'+mm).slice(-2)+'m '+('0'+ss).slice(-2)+'s';
}catch(e){}
};
x.send();
}
function fmtBytes(b){
if(!b||b<1024)return (b||0)+'B';
if(b<1048576)return (b/1024).toFixed(1)+'KB';
return (b/1048576).toFixed(1)+'MB';
}
function protoChange2(el,idx){
var rows=document.querySelectorAll('.civ-addr-row-'+idx);
for(var r=0;r<rows.length;r++)rows[r].style.display=el.value=='0'?'block':'none';
}
// Hamplus functions
function hpAnt(n){envia('/api/save',{'hp_ant':n});}
function hpRadio(n){envia('/api/save',{'hp_radio':n});}
function hpSplit(){envia('/api/save',{'hp_split':true});}
var hpCurrentRotor=1;
function hpRotor(n){hpCurrentRotor=n;toast('Rotor '+n+' selecionado','info');}
function hpDir(d){envia('/api/save',{'hp_rotor':hpCurrentRotor,'hp_dir':d});}
function carregarHP(){
var x=new XMLHttpRequest();
x.open('GET','/api/status',true);
x.onload=function(){
try{
var d=JSON.parse(x.responseText);
// LEDs
var l=function(id,on){var e=document.getElementById(id);if(e)e.style.background=on?'#10b981':'#333';};
l('hp_led_pwr',true);
l('hp_led_send',d.hp_ptt||false);
l('hp_led_split',d.hp_split||false);
// Rotor direction
if(d.hp_dir!=undefined){var dir=('000'+d.hp_dir).slice(-3);var el=document.getElementById('hp_rotor_dir');if(el)el.textContent=dir;}
// Highlight selected Rotor
var ra=hpCurrentRotor||1;
document.querySelectorAll('.hp-rotor-btn').forEach(function(e){e.style.borderColor=e.innerHTML=='Rotor '+ra?'#4fc3f7':'rgba(79,195,247,0.2)';e.style.background=e.innerHTML=='Rotor '+ra?'rgba(79,195,247,0.2)':'#1a2a3a';});
// Highlight selected Antenna
document.querySelectorAll('.hp-ant-btn').forEach(function(e){var n=parseInt(e.textContent.match(/\d+/)[0]);e.style.borderColor=n==d.hp_antenna?'#FFB300':'rgba(79,195,247,0.2)';e.style.background=n==d.hp_antenna?'rgba(255,179,0,0.2)':'#1a2a3a';e.style.opacity=n>6?'0.5':'1';});
// Highlight selected Radio
document.querySelectorAll('.hp-radio-btn').forEach(function(e){var n=parseInt(e.textContent.match(/\d+/)[0]);e.style.borderColor=n==d.hp_radio?'#FFB300':'rgba(79,195,247,0.2)';e.style.background=n==d.hp_radio?'rgba(255,179,0,0.2)':'#1a2a3a';e.style.opacity=n>3?'0.5':'1';});
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
var elStas=document.getElementById('stas');if(elStas)elStas.value=d.stas||'';var elStap=document.getElementById('stap');if(elStap)elStap.value=d.stap||'';
document.getElementById('dhcp').checked=d.dh!==false;
document.getElementById('sip').value=d.sip||'';document.getElementById('sgw').value=d.sgw||'';
document.getElementById('ssn').value=d.ssn||'';document.getElementById('sd1').value=d.sd1||'';document.getElementById('sd2').value=d.sd2||'';
// Porta ativa gerenciada via protocolo de cada porta
if(d.ports) for(var pi=0;pi<4&&pi<d.ports.length;pi++){
var p=d.ports[pi];
var pe=document.querySelector('.pe[data-idx="'+pi+'"]');if(pe)pe.checked=p.en;
var pp=document.querySelector('.pp[data-idx="'+pi+'"]');if(pp)pp.value=''+(p.pr||0);
var pb=document.querySelector('.pb[data-idx="'+pi+'"]');if(pb)pb.value=''+(p.ba||19200);
var pa=document.querySelector('.pa[data-idx="'+pi+'"]');if(pa)pa.value=p.ad||'0x94';
var rows=document.querySelectorAll('.civ-addr-row-'+pi);
for(var r=0;r<rows.length;r++)rows[r].style.display=(p.pr==0)?'block':'none';
var card=pe?pe.closest('.card'):null;
if(card)card.style.borderColor=p.en?'rgba(79,195,247,0.3)':'rgba(239,68,68,0.3)';
}
document.getElementById('ipf').style.display=d.dh!==false?'none':'block';
if(d.lBLE!=undefined)document.getElementById('lb_BLE').checked=d.lBLE==1;
if(d.lCIV!=undefined)document.getElementById('lb_CIV').checked=d.lCIV==1;
if(d.lIC705!=undefined)document.getElementById('lb_IC705').checked=d.lIC705==1;
if(d.lWiFi!=undefined)document.getElementById('lb_WiFi').checked=d.lWiFi==1;
if(d.lSYS!=undefined)document.getElementById('lb_SYS').checked=d.lSYS==1;
if(d.lERRO!=undefined)document.getElementById('lb_ERRO').checked=d.lERRO==1;
carregarLogs();
}catch(e){carregarLogs();}
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
function scanBLE(){
var b=document.getElementById('b_scanble');
b.disabled=true;b.textContent='Escaneando...';
document.getElementById('ble-list').innerHTML='';
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
function sCIV(){
var data={};
for(var i=0;i<4;i++){
var enEl=document.querySelector('.pe[data-idx="'+i+'"]');
var prEl=document.querySelector('.pp[data-idx="'+i+'"]');
var baEl=document.querySelector('.pb[data-idx="'+i+'"]');
var adEl=document.querySelector('.pa[data-idx="'+i+'"]');
if(enEl)data['pe'+i]=enEl.checked?1:0;
if(prEl)data['pp'+i]=parseInt(prEl.value);
if(baEl)data['pb'+i]=parseInt(baEl.value);
if(adEl)data['pa'+i]=adEl.value;
}
envia('/api/save',data,function(){carregarCfg();});
}
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
function rebootESP(){
if(!confirm('Reiniciar o dispositivo?'))return;
envia('/api/save',{reboot:true});
}
function factoryReset(){
if(!confirm('TEM CERTEZA? Isso vai apagar TODAS as configuracoes (WiFi, usuarios, portas, etc) e reiniciar o dispositivo.'))return;
if(!confirm('CONFIRMO! Desejo restaurar para fabrica.'))return;
envia('/api/save',{factory:true});
}
carregar();
setTimeout(carregarCfg,300);
setTimeout(carregarRedes,600);
setTimeout(carregarBT,900);
setInterval(carregar,5000);
</script>
<div style="text-align:center;padding:12px;font-size:10px;color:#555;border-top:1px solid rgba(79,195,247,0.1);margin-top:12px">
Copyright &copy; ForceIT by PR2PT &mdash; <a href="http://forceit.com.br" style="color:#4fc3f7;text-decoration:none" target="_blank">forceit.com.br</a> &mdash; <a href="https://hamportal.cc" style="color:#4fc3f7;text-decoration:none" target="_blank">hamportal.cc</a>
</div>
</body></html>
)rawliteral");
}

void h_cfg() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  StaticJsonDocument<2048> d;
  d["aps"]=cfg.ap_ssid; d["app"]=cfg.ap_pass; d["stas"]=cfg.sta_ssid; d["stap"]=cfg.sta_pass; d["dh"]=cfg.sta_dhcp;
  d["sip"]=cfg.sta_ip.toString(); d["sgw"]=cfg.sta_gw.toString(); d["ssn"]=cfg.sta_sn.toString(); d["sd1"]=cfg.sta_d1.toString(); d["sd2"]=cfg.sta_d2.toString();
  { char buf[8]; snprintf(buf,sizeof(buf),"0x%02X",cfg.cat_addr); d["ca705"]=buf; }
  d["lBLE"]=log_enabled.ble?1:0; d["lCIV"]=log_enabled.civ?1:0; d["lIC705"]=log_enabled.ic5?1:0;
  d["lWiFi"]=log_enabled.wifi?1:0; d["lSYS"]=log_enabled.sys?1:0; d["lERRO"]=log_enabled.erro?1:0;
  JsonArray usr=d.createNestedArray("users");
  for(int i=0;i<user_count;i++){JsonObject o=usr.createNestedObject();o["n"]=users[i].name;}
  d["bn"]=cfg.bt_name; d["btn"]=cfg.bt_name; d["btp"]=cfg.bt_pass; d["ce"]=cfg.cat_enabled; d["cp"]=cfg.cat_port;
  d["ap"]=cfg.active_port; d["pp"]=cfg.port_proto[cfg.active_port-1];
  uint8_t pt_=cfg.port_proto[cfg.active_port-1];
  d["cb"]=(pt_>=PROTO_SPE)?cfg.spe_baud[cfg.active_port-1]:cfg.civ_baud[cfg.active_port-1];
  d["ca"]="0x"+String(cfg.civ_addr[cfg.active_port-1],HEX);
  // Dados de todas as portas
  JsonArray pa=d.createNestedArray("ports");
  for(int i=0;i<4;i++){
    JsonObject po=pa.createNestedObject();
    po["en"]=cfg.port_enabled[i]; po["pr"]=cfg.port_proto[i]; po["ba"]=(cfg.port_proto[i]>=PROTO_SPE)?cfg.spe_baud[i]:cfg.civ_baud[i]; po["ad"]="0x"+String(cfg.civ_addr[i],HEX);
  }
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

void h_sts() {
  if(!checkAuth()){srv.send(401,"application/json","{\"success\":false}");return;}
  StaticJsonDocument<1024> d;
  d["ic5con"]=ic5con; d["ic5civ"]=ic5civ; d["ic5pair"]=ic5pair;
  d["freq"]=ic5_freq; d["mode"]=ic5_mode_str; d["ptt"]=ic5_ptt; d["pwr"]=ic5_pwr;
  d["mode_num"]=ic5_mode; d["filt"]=ic5_filt; d["split"]=ic5_split;
  d["agc"]=ic5_agc; d["pre"]=ic5_pre; d["att"]=ic5_att;
  d["btn"]=cfg.bt_name; d["btp"]=cfg.bt_pass; d["nuscon"]=nuscon;
  d["rf"]=ic5_rf; d["af"]=ic5_af; d["smeter"]=ic5_smeter;
  d["ap_ip"]=WiFi.softAPIP().toString(); d["sta_con"]=sta_con;
  d["sta_ip"]=sta_con?WiFi.localIP().toString():"";
  // SPE fields apenas quando ativo (reduz resposta JSON)
  d["spe_active"]=sp_is_active();
  d["hp_ptt"]=hp_ptt; d["hp_split"]=hp_split; d["hp_antenna"]=hp_antenna; d["hp_radio"]=hp_radio; d["hp_dir"]=hp_dir;
  if(sp_is_active()){
    d["spe_id"]=spe_id; d["spe_op"]=spe_op; d["spe_tx"]=spe_tx;
    d["spe_pout"]=spe_pout; d["spe_pwr_level"]=String(spe_pwr_level);
    d["spe_swr_atu"]=spe_swr_atu; d["spe_swr_ant"]=spe_swr_ant;
    d["spe_vpa"]=spe_vpa; d["spe_ipa"]=spe_ipa;
    d["spe_temp_up"]=spe_temp_up; d["spe_input"]=spe_input;
    d["spe_band"]=spe_band; d["spe_ant"]=spe_ant;
    d["spe_warn"]=String(spe_warn); d["spe_alarm"]=String(spe_alarm);
  }
  String r; serializeJson(d,r); srv.send(200,"application/json",r);
}

// BLE scan callback for discovering nearby devices
String ble_scan_buf="[";
int ble_scan_cnt=0;

class BLEDeviceCB : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice dev) {
    if(ble_scan_cnt>=30) return;
    if(ble_scan_cnt>0) ble_scan_buf+=",";
    String dn=dev.getName();
    if(dn.length()==0 && dev.haveName()) dn=dev.getName();
    if(dn.length()==0) dn="?";
    // Escape JSON special chars in name
    dn.replace("\\","\\\\"); dn.replace("\"","\\\"");
    ble_scan_buf+="{\"n\":\"";
    ble_scan_buf+=dn.c_str();
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
  ble_scan_results="[]";
  ble_scan_buf="[";
  ble_scan_cnt=0;
  BLEScan* sc=BLEDevice::getScan();
  sc->clearResults();
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
  if(d.containsKey("cb")){
    uint32_t b=d["cb"].as<uint32_t>();
    uint8_t pt=cfg.port_proto[cfg.active_port-1];
    if(pt==PROTO_SPE||pt==PROTO_YAESU||pt==PROTO_KENWOOD) cfg.spe_baud[cfg.active_port-1]=b;
    else cfg.civ_baud[cfg.active_port-1]=b;
    rst_port(cfg.active_port);
  }
  if(d.containsKey("ca")){String a=d["ca"].as<String>();cfg.civ_addr[cfg.active_port-1]=(uint8_t)strtol(a.c_str(),NULL,16);}
  if(d.containsKey("pp")){cfg.port_proto[cfg.active_port-1]=d["pp"].as<uint8_t>();rst_port(cfg.active_port);}
  // Per-port settings (from port cards)
  for(int i=0;i<4;i++){
    char ke[8],kp[8],kb[8],ka[8]; snprintf(ke,8,"pe%d",i); snprintf(kp,8,"pp%d",i); snprintf(kb,8,"pb%d",i); snprintf(ka,8,"pa%d",i);
    if(d.containsKey(ke)) cfg.port_enabled[i]=d[ke].as<int>()==1;
    if(d.containsKey(kp)) cfg.port_proto[i]=d[kp].as<uint8_t>();
    if(d.containsKey(kb)){
      uint32_t bd=d[kb].as<uint32_t>();
      if(cfg.port_proto[i]>=PROTO_SPE) cfg.spe_baud[i]=bd; else cfg.civ_baud[i]=bd;
    }
    if(d.containsKey(ka)){String a=d[ka].as<String>();cfg.civ_addr[i]=(uint8_t)strtol(a.c_str(),NULL,16);}
  }
  save_cfg();

  if(d.containsKey("disc_ic5")&&d["disc_ic5"].as<bool>()){if(ic5cli)ic5cli->disconnect();srv.send(200,"application/json","{\"success\":true}");return;}
  if(d.containsKey("scan_ic5")&&d["scan_ic5"].as<bool>()){scan_ic5();srv.send(200,"application/json","{\"success\":true}");return;}
   if(d.containsKey("reboot")&&d["reboot"].as<bool>()){srv.send(200,"application/json","{\"success\":true}");delay(500);ESP.restart();return;}
  if(d.containsKey("factory")&&d["factory"].as<bool>()){nvs.begin("civ-gw",false);nvs.clear();nvs.end();srv.send(200,"application/json","{\"success\":true}");delay(500);ESP.restart();return;}

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
  // SPE commands
  else if(d.containsKey("op")){if(sp_is_active())spe_set_op(d["op"].as<int>()==1);}
  else if(d.containsKey("spwr")){if(sp_is_active())spe_set_pwr();}
  else if(d.containsKey("input")){if(sp_is_active())spe_set_input(d["input"].as<int>());}
  else if(d.containsKey("tune")){if(sp_is_active())spe_tune();}
  else if(d.containsKey("ant")){if(sp_is_active())sp_send_cmd(SPE_CMD_ANT);}
  else if(d.containsKey("lm")){if(sp_is_active())sp_send_cmd(SPE_CMD_L_M);}
  else if(d.containsKey("lp")){if(sp_is_active())sp_send_cmd(SPE_CMD_L_P);}
  else if(d.containsKey("cm")){if(sp_is_active())sp_send_cmd(SPE_CMD_C_M);}
  else if(d.containsKey("cp")){if(sp_is_active())sp_send_cmd(SPE_CMD_C_P);}
  else if(d.containsKey("bm")){if(sp_is_active())sp_send_cmd(SPE_CMD_BAND_M);}
  else if(d.containsKey("bp")){if(sp_is_active())sp_send_cmd(SPE_CMD_BAND_P);}
  else if(d.containsKey("left")){if(sp_is_active())sp_send_cmd(SPE_CMD_LEFT);}
  else if(d.containsKey("right")){if(sp_is_active())sp_send_cmd(SPE_CMD_RIGHT);}
  else if(d.containsKey("up")){if(sp_is_active())sp_send_cmd(SPE_CMD_L_P);}
  else if(d.containsKey("down")){if(sp_is_active())sp_send_cmd(SPE_CMD_L_M);}
  else if(d.containsKey("catkey")){if(sp_is_active())sp_send_cmd(SPE_CMD_CAT);}
  else if(d.containsKey("disp")){if(sp_is_active())sp_send_cmd(SPE_CMD_DISPLAY);}
  else if(d.containsKey("setkey")){if(sp_is_active())sp_send_cmd(SPE_CMD_SET);}
  else if(d.containsKey("blon")){if(sp_is_active())sp_send_cmd(SPE_CMD_BL_ON);}
  else if(d.containsKey("bloff")){if(sp_is_active())sp_send_cmd(SPE_CMD_BL_OFF);}
  // Hamplus HP603 commands
  else if(d.containsKey("hp_ant")){if(hp_is_active()){int a=d["hp_ant"].as<int>();if(a>=1&&a<=6)hp_send(a);}}
  else if(d.containsKey("hp_radio")){if(hp_is_active()){int r=d["hp_radio"].as<int>();if(r>=1&&r<=3)hp_send(6+r);}}
  else if(d.containsKey("hp_split")){if(hp_is_active())hp_send(0x0A);}
  else if(d.containsKey("hp_sts")){if(hp_is_active())hp_send(0x00);}
  else if(d.containsKey("hp_dir")&&d.containsKey("hp_rotor")){hp_rotor_active=d["hp_rotor"].as<int>();int dir=d["hp_dir"].as<int>();hp_dir+=dir;if(hp_dir>360)hp_dir-=360;if(hp_dir<0)hp_dir+=360;}

  srv.send(200,"application/json","{\"success\":true}");
}

void h_login_page() {
  srv.send_P(200,"text/html",(PGM_P)R"rawliteral(
<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>CAT-Bridge CAT/CI-V/BT Gateway - Login</title>
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
<h1>CAT-Bridge CAT/CI-V/BT Gateway</h1>
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
)rawliteral");
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

  Serial.println("\n=== CAT-Bridge CAT/CI-V/BT Gateway v" FIRMWARE_VERSION " ===\n");
  Serial.println("[BOOT] Iniciando...");
  load_cfg();

  p1.begin(cfg.civ_baud[0],SERIAL_8N1,PORT1_RX,PORT1_TX);
  p2.begin(cfg.civ_baud[1],SERIAL_8N1,PORT2_RX,PORT2_TX);
  p3.begin(cfg.civ_baud[2],SERIAL_8N1,PORT3_RX,PORT3_TX);
  Serial.println("[CI-V] 3 portas UART + 1 SPE RS232");
  sel_port(cfg.active_port);
  sp_init();

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
  loop_iters++;
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
    // Diagnostico da conexao IC-705 a cada 30s
    static unsigned long last_diag=0;
    if(millis()-last_diag>30000){
      last_diag=millis();
      Serial.printf("[DIAG] IC5: con=%d civ=%d pair=%d freq=%llu\n",ic5con,ic5civ,ic5pair,ic5_freq);
    }
    poll_ic5();
    proc_ic5();
    bridge_ic5p();
    bridge_pic5();
    // Traduz CI-V (IC-705) para SPE
    translate_civ_to_spe();
    translate_civ_to_cat();
  }

  // SPE polling (quando porta ativa for SPE)
  if(sp_is_active()){
    sp_poll();
    sp_read();
  }

  // Yaesu polling
  if(ys_is_active()){
    ys_poll();
    ys_read();
    translate_ys_to_spe();
    translate_cat_to_civ();
  }

  // Kenwood polling
  if(kw_is_active()){
    kw_poll();
    kw_read();
    translate_kw_to_spe();
    translate_cat_to_civ();
  }

  // FlexRadio polling
  if(fr_is_active()){ fr_poll(); fr_read(); }

  // Hamplus HP603 polling
  if(hp_is_active()){ hp_poll(); hp_read(); }
  // Hamplus bidirecional: recebe de outros protocolos e envia para outros
  if(hp_is_active()){
    translate_to_hp();
    translate_hp_to_others();
  }

  bridge_nusp();
  bridge_pnus();

  // Calculo de CPU
  static unsigned long last_cpu_check = 0;
  unsigned long now = millis();
  if(now - last_cpu_check >= 1000) {
    unsigned long cur = loop_iters - last_loop_iters;
    if(cur > max_loop_iters) max_loop_iters = cur;
    cpu_pct = max_loop_iters > 0 ? 100 - (cur * 100 / max_loop_iters) : 0;
    last_loop_iters = loop_iters;
    last_cpu_check = now;
    // WiFi utilizacao: req/s normalizado (max ~50 req/s)
    unsigned long rps = req_count - req_count_last;
    wifi_util_pct = rps > 50 ? 100 : rps * 2;
    req_count_last = req_count;
  }

  delay(1);
}
