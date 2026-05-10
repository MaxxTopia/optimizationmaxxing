# DSCP / QoS — router companion to the catalog QoS tweak

Our catalog tweak `network.qos.dscp-tag` creates a Group Policy QoS rule that tags outbound game traffic (Fortnite / CS2 / Valorant / Apex executables) with **DSCP value 46** — the IETF "Expedited Forwarding" code. Tag alone does nothing without a router that honors it.

This page covers the router-side rule for the most common consumer + prosumer setups.

## What DSCP 46 / Expedited Forwarding actually does

The DSCP field is 6 bits in the IP header. Value 46 (`0xB8` in DSCP-shifted form) is reserved for "Expedited Forwarding" per RFC 3246 — the highest-priority class for real-time traffic. Routers that implement DiffServ:

1. Read the DSCP value on inbound queue
2. Sort packets into queues by class (EF goes to the highest-priority queue)
3. Service the EF queue before any other queue when there's bandwidth contention

In practice: when your roommate's Netflix is saturating the WAN upload, your Fortnite ACK packets jump the line and don't get queued behind Netflix's TCP segments.

**Caveat:** if your router doesn't honor DSCP, the tag is harmless. The packet still goes out, the ISP either honors EF (rare) or strips/ignores the tag. No regression.

## Per-router setup

### ASUS routers (Merlin firmware or stock AsusWRT 388+)

1. Web UI → **Adaptive QoS** → **QoS** tab
2. Set **Enable QoS** = ON, **QoS Type** = `Adaptive QoS` (NOT Bandwidth Limiter)
3. Profile: **Game** (this preset already prioritizes EF + AF41/43)
4. Done. ASUS Adaptive QoS auto-classifies based on DSCP for the Game profile.

If you want explicit DSCP-only mode (no automatic classification): switch QoS Type → **Traditional QoS** → upload your own classification rules (advanced; UI is rough).

### Netgear Nighthawk (R7000+ / RAX-series)

1. **Dynamic QoS** → ON
2. Netgear's Dynamic QoS uses BitDefender-classified flow patterns + auto-honors DSCP EF when set
3. No additional rules needed — verify by enabling QoS, applying our catalog tweak, then watching the QoS dashboard during a game session — you should see Fortnite traffic in the "Real-time" priority class

### TP-Link Archer (most consumer models)

1. **Advanced** → **QoS** → enable QoS
2. Set total bandwidth (your real measured up/down — use [fast.com](https://fast.com))
3. **High Priority** queue → Add **Application** → select Online Games OR add custom rule with **DSCP** value 46
4. Apply

Older TP-Link models without DSCP-aware QoS won't help — check the QoS rule editor for a "DSCP" field. If absent, your router doesn't honor it.

### Ubiquiti UniFi (UDM Pro / UDR / UCK)

1. **Network app → Settings → Internet → Smart Queues** → ON (sets up CAKE qdisc with EF priority by default)
2. CAKE auto-honors DSCP EF — no rule needed
3. Verify: SSH into the gateway → `tc -s qdisc show` → look for `cake` with `diffserv4` mode

If you're on USG (legacy), DSCP marking is harder — the USG doesn't expose CAKE. Upgrade to UDM/UCK for proper DSCP-aware queueing.

### pfSense / OPNsense

The full-DSCP setup. Steps for pfSense (OPNsense is similar):

1. **Firewall → Traffic Shaper → Wizards** → **Multi LAN/WAN**
2. Run the wizard, select **PRIQ** (priority queueing) or **HFSC** (more nuanced)
3. The wizard creates queues `qACK`, `qVoIP`, `qGames`, `qOthersHigh`, `qOthersLow`
4. **Firewall → Traffic Shaper → By Queue** → confirm `qVoIP` (priority 7) maps to DSCP EF
5. **Firewall → Rules → LAN** → edit your default LAN→WAN rule → **Advanced Options** → set Acknowledge Queue: `qACK` and Queue: based on classification

In pfSense, traffic with DSCP=46 will hit the `qVoIP` queue (top priority) automatically once the wizard's defaults are in place.

### OpenWRT / DD-WRT

1. Install **SQM Scripts** package (`opkg install luci-app-sqm`)
2. **Network → SQM QoS** → enable on the WAN interface
3. **Queue Discipline:** `cake` (best DSCP support)
4. **Queue Setup Script:** `piece_of_cake.qos` for basic, `layer_cake.qos` for full DSCP-aware classes
5. Apply — `layer_cake` honors DSCP EF as the highest-priority bin

### What if I'm just on my ISP's combo modem-router?

Most ISP-issued combo units (Xfinity Gateway, AT&T BGW320, Verizon Fios G3100) don't honor DSCP. Two paths:

1. **Bridge the ISP unit** + add your own router (any of the above)
2. **Run the ISP unit in pass-through** + add your own router

Either way you need a real router downstream. The DSCP tag we set will get stripped by most ISP units — the win comes from upstream queueing, not downstream.

## Verifying it works

After applying both ends:

1. Saturate your WAN upload — start a big upload (Steam upload, OBS to YouTube), or have a roommate stream 4K
2. Run our `/toolkit → Bufferbloat probe` — measure ping under load
3. Compare: with QoS off vs QoS on, your **bufferbloat grade should improve by 1-2 letters** for game-tagged traffic specifically
4. Or in-game: ping should stay flat under upload load instead of spiking

If you don't see a difference, your router isn't honoring DSCP — check the per-router setup above for the right mode.

## Citations

- [RFC 3246 — Expedited Forwarding PHB](https://datatracker.ietf.org/doc/html/rfc3246)
- [Microsoft `New-NetQosPolicy` documentation](https://learn.microsoft.com/en-us/powershell/module/netqos/new-netqospolicy) — the cmdlet our catalog tweak uses
- ASUS Adaptive QoS knowledge base (search "ASUS DSCP Adaptive QoS")
- [pfSense Traffic Shaper docs](https://docs.netgate.com/pfsense/en/latest/trafficshaper/index.html)
- [Ubiquiti CAKE Smart Queues](https://help.ui.com/hc/en-us/articles/360002883574-UniFi-Network-Smart-Queues-CAKE)
