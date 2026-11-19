/*
 * UDP voice tap for Ham Cockpit monitor PCM pipeline.
 */
#include "HamCockpitVoiceTap.h"

#include <arpa/inet.h>
#include <cstring>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include "DMRDefines.h"
#include "DStarDefines.h"
#include "YSFDefines.h"

namespace {

int g_sock = -1;
sockaddr_in g_dest {};

void ensureSock()
{
	if (g_sock >= 0)
		return;

	g_sock = ::socket(AF_INET, SOCK_DGRAM, 0);
	if (g_sock < 0)
		return;

	::memset(&g_dest, 0, sizeof(g_dest));
	g_dest.sin_family = AF_INET;
	g_dest.sin_port = htons(HC_VOICE_PORT);
	if (::inet_pton(AF_INET, HC_VOICE_ADDR, &g_dest.sin_addr) != 1) {
		::close(g_sock);
		g_sock = -1;
	}
}

void sendPacket(uint8_t mode, uint8_t kind, uint8_t slot, const uint8_t* payload, uint16_t len)
{
	if (len > 1400U)
		return;

	ensureSock();
	if (g_sock < 0)
		return;

	uint8_t buf[8U + 1400U];
	buf[0U] = HC_VOICE_MAGIC0;
	buf[1U] = HC_VOICE_MAGIC1;
	buf[2U] = HC_VOICE_MAGIC2;
	buf[3U] = HC_VOICE_MAGIC3;
	buf[4U] = mode;
	buf[5U] = kind;
	buf[6U] = slot;
	buf[7U] = 0U;
	buf[8U] = static_cast<uint8_t>(len & 0xFFU);
	buf[9U] = static_cast<uint8_t>((len >> 8) & 0xFFU);

	if (len > 0U && payload != nullptr)
		::memcpy(buf + 10U, payload, len);

	::sendto(g_sock, buf, 10U + len, 0, reinterpret_cast<sockaddr*>(&g_dest), sizeof(g_dest));
}

} // namespace

void hcVoiceTapInit()
{
	ensureSock();
}

void hcVoiceTapRaw(uint8_t mode, uint8_t kind, uint8_t slot, const uint8_t* payload, uint16_t len)
{
	sendPacket(mode, kind, slot, payload, len);
}

void hcVoiceTapDmr(unsigned int slotNo, const uint8_t* frame33)
{
	if (frame33 == nullptr)
		return;
	sendPacket(HC_VOICE_MODE_DMR, HC_VOICE_KIND_FRAME, static_cast<uint8_t>(slotNo & 0xFFU), frame33, DMR_FRAME_LENGTH_BYTES);
}

void hcVoiceTapDStar(const uint8_t* dv9)
{
	if (dv9 == nullptr)
		return;
	sendPacket(HC_VOICE_MODE_DSTAR, HC_VOICE_KIND_FRAME, 0U, dv9, DSTAR_VOICE_FRAME_LENGTH_BYTES);
}

void hcVoiceTapYsf(const uint8_t* frame120)
{
	if (frame120 == nullptr)
		return;
	sendPacket(HC_VOICE_MODE_YSF, HC_VOICE_KIND_FRAME, 0U, frame120, YSF_FRAME_LENGTH_BYTES);
}