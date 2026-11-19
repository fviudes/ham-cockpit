#include "decode.hpp"
#include "protocol.hpp"

#include <fcntl.h>
#include <poll.h>
#include <sys/stat.h>
#include <unistd.h>

#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <fstream>
#include <iostream>
#include <netinet/in.h>
#include <string>
#include <sys/socket.h>
#include <chrono>

namespace {

struct Options {
  std::string fifo = "/run/ham-cockpit/mmdvm-monitor.pcm";
  std::string state = "/run/ham-cockpit/mmdvm-hat-mode.json";
  uint16_t port = HC_VOICE_PORT;
};

void usage(const char* argv0)
{
  std::cerr << "uso: " << argv0 << " [--fifo path] [--state path] [--port n]\n";
}

bool parseArgs(int argc, char** argv, Options& o)
{
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--fifo" && i + 1 < argc)
      o.fifo = argv[++i];
    else if (a == "--state" && i + 1 < argc)
      o.state = argv[++i];
    else if (a == "--port" && i + 1 < argc)
      o.port = static_cast<uint16_t>(std::stoi(argv[++i]));
    else if (a == "--help" || a == "-h") {
      usage(argv[0]);
      return false;
    } else
      return false;
  }
  return true;
}

struct HatState {
  std::string id = "idle";
  bool paused = false;
};

HatState readHatState(const std::string& path)
{
  HatState st;
  std::ifstream in(path);
  if (!in)
    return st;
  std::string body((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  auto find = [&](const char* key) -> std::string {
    const std::string k = std::string("\"") + key + "\"";
    const auto p = body.find(k);
    if (p == std::string::npos)
      return "";
    const auto q = body.find(':', p);
    if (q == std::string::npos)
      return "";
  const auto q1 = body.find('"', q + 1);
    const auto q2 = body.find('"', q1 + 1);
    if (q1 == std::string::npos || q2 == std::string::npos)
      return "";
    return body.substr(q1 + 1, q2 - q1 - 1);
  };
  const std::string id = find("id");
  if (!id.empty())
    st.id = id;
  st.paused = body.find("\"paused\":true") != std::string::npos;
  return st;
}

bool modeAllowed(const HatState& hat, HcVoiceMode mode)
{
  if (hat.paused)
    return false;
  if (hat.id == "idle" || hat.id.empty())
    return true;
  if (hat.id == "dmr")
    return mode == HC_MODE_DMR;
  if (hat.id == "dstar")
    return mode == HC_MODE_DSTAR;
  if (hat.id == "ysf")
    return mode == HC_MODE_YSF;
  if (hat.id == "p25")
    return mode == HC_MODE_P25;
  if (hat.id == "nxdn")
    return mode == HC_MODE_NXDN;
  if (hat.id == "m17")
    return mode == HC_MODE_M17;
  if (hat.id == "fm")
    return mode == HC_MODE_FM;
  return true;
}

ssize_t writeAll(int fd, const void* buf, size_t len)
{
  const uint8_t* p = static_cast<const uint8_t*>(buf);
  size_t off = 0;
  while (off < len) {
    const ssize_t n = ::write(fd, p + off, len - off);
    if (n < 0) {
      if (errno == EINTR)
        continue;
      return n;
    }
    if (n == 0)
      break;
    off += static_cast<size_t>(n);
  }
  return static_cast<ssize_t>(off);
}

void writeSilence48k(int fd, int frames)
{
  int16_t zero[960] {};
  for (int i = 0; i < frames; ++i)
    writeAll(fd, zero, sizeof(zero));
}

} // namespace

int main(int argc, char** argv)
{
  Options opt;
  if (!parseArgs(argc, argv, opt)) {
    usage(argv[0]);
    return 2;
  }

  const int fifoFd = ::open(opt.fifo.c_str(), O_WRONLY);
  if (fifoFd < 0) {
    std::cerr << "hc-mmdvm-decode: não abriu FIFO " << opt.fifo << ": " << std::strerror(errno) << "\n";
    return 1;
  }

  const int sock = ::socket(AF_INET, SOCK_DGRAM, 0);
  if (sock < 0) {
    std::cerr << "hc-mmdvm-decode: socket UDP falhou\n";
    return 1;
  }

  sockaddr_in addr {};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons(opt.port);
  if (::bind(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
    std::cerr << "hc-mmdvm-decode: bind :%" << opt.port << " falhou\n";
    return 1;
  }

  VoiceDecoder dec;
  HatState hat;
  auto lastState = std::chrono::steady_clock::now();

  int16_t pcm8k[160];
  int16_t pcm48k[960];

  pollfd fds[2];
  fds[0].fd = sock;
  fds[0].events = POLLIN;
  fds[1].fd = fifoFd;
  fds[1].events = 0;

  std::cerr << "hc-mmdvm-decode: UDP :" << opt.port << " → FIFO " << opt.fifo << " (S16_LE 48 kHz mono)\n";

  while (true) {
    const int pr = ::poll(fds, 1, 100);
    const auto now = std::chrono::steady_clock::now();
    if (now - lastState > std::chrono::milliseconds(500)) {
      hat = readHatState(opt.state);
      lastState = now;
    }

    if (pr <= 0) {
      if (hat.paused)
        writeSilence48k(fifoFd, 1);
      continue;
    }

    uint8_t buf[2048];
    const ssize_t n = ::recvfrom(sock, buf, sizeof(buf), 0, nullptr, nullptr);
    if (n < 10)
      continue;
    if (std::memcmp(buf, HC_VOICE_MAGIC, 4) != 0)
      continue;

    const auto mode = static_cast<HcVoiceMode>(buf[4]);
    const auto kind = static_cast<HcVoiceKind>(buf[5]);
    const uint16_t plen = static_cast<uint16_t>(buf[8] | (buf[9] << 8));
    if (10 + plen > static_cast<unsigned>(n))
      continue;
    if (kind != HC_KIND_FRAME)
      continue;
    if (!modeAllowed(hat, mode))
      continue;

    int samples = 0;
    if (!dec.decodeFrame(mode, buf + 10, plen, pcm8k, &samples) || samples <= 0) {
      continue;
    }

    const int outN = samples * 6;
    upsample6x(pcm8k, samples, pcm48k, outN);
    writeAll(fifoFd, pcm48k, static_cast<size_t>(outN) * sizeof(int16_t));
  }
}