# Specification: Skill Self-Assessment & Learning Path Recommendation Engine

This document details the functional and architectural specifications for the redesigned **Skill Self-Assessment** module in the Academy Builder application.

---

## 1. Persona Definition (Primary Roles)
Before interacting with the sliders, the user must select their primary engineering role. This selection helps baseline the recommendations and establishes expectation weights for each skill domain.

| Role | Target Focus Track | Expected Skill Strengths |
| :--- | :--- | :--- |
| **Entry-Level Engineer** | Network Foundations | Basic layers 1–3, TCP/IP, basic EOS |
| **Mid-Level Engineer** | Campus / Network Foundations | Campus design, switching, routing, dynamic protocols |
| **Senior-Level Engineer** | Data Center / WAN Routing | Advanced routing, fabric operations, troubleshooting |
| **Operations Support** | Data Center / Automation | Troubleshooting, telemetry, operations |
| **Senior Architect** | Data Center / Campus | EVPN, leaf-spine design, segmentation, scripting |

---

## 2. Assessment Sliders (12 Categories)
The assessment uses 12 detailed skill areas rated on a **0 to 10 scale**:

### Foundational Knowledge
1. **OSI Model/Layers 1–3 (Cabling/Switching/Routing)**: Understanding of ethernet, MAC, IP headers, and fundamental routing.
2. **TCP/IP & Subnetting**: Understanding of IPv4/IPv6 subnetting, CIDR, masks, and protocol ports.
3. **Core Protocols (BGP/OSPF/STP)**: Dynamic routing protocols and spanning tree operations.

### Arista & Data Center Specifics
4. **EOS Familiarity**: Experience with Arista Extensible Operating System command-line and configuration.
5. **Leaf-Spine Architecture**: Design, routing (L2 vs. L3 spine), and cabling of physical fabrics.
6. **VXLAN/EVPN Concepts**: Dynamic overlay networking, VTEPs, and BGP EVPN control-planes.
7. **Data Center Operations & Troubleshooting**: General DC operations, power, and hardware replacement.
8. **Campus Network Design**: Multi-tier enterprise networks, MLAG, and campus segmentation.

### Operational & Automation Skills
9. **Network Automation & Scripting (Python/Ansible)**: Experience with scripting network configurations.
10. **Telemetry & Monitoring**: Advanced query telemetry (AQL), streaming state, and SNMP/Syslog monitoring.
11. **Security Fundamentals (Segmentation/Firewalls)**: Least-privilege segmentation, zone-based rules, and firewalls.
12. **Troubleshooting Methodology**: Structured isolation and resolution of network issues.

---

## 3. Database Ingestion & Mapping Logic
When the user submits the assessment, the frontend maps the 12 slider scores into the 5 main database track topics to generate a personalized learning path.

```
                  +----------------------------------------------+
                  |           12 Skill assessment Sliders         |
                  +-----------------------+----------------------+
                                          |
        +---------------------------------+---------------------------------+
        | Foundational                    | Data Center                     | Automation / Operational
        v                                 v                                 v
 [OSI Model, TCP/IP,               [EOS, Leaf-Spine,                 [Automation, Telemetry,
  Core Protocols]                   VXLAN/EVPN, Ops]                  Security, Troubleshooting]
        |                                 |                                 |
        +------------------+--------------+---------------+-----------------+
                           |                              |
                           v                              v
               +-----------+-----------+      +-----------+-----------+
               | Mapped Catalog Topics |      | Mapped Catalog Topics |
               +-----------+-----------+      +-----------+-----------+
                           |                              |
                           +---------------+--------------+
                                           |
                                           v
                  +------------------------+----------------------+
                  |   RAG Filtering and Path Assembly Algorithm    |
                  +------------------------+----------------------+
                                           |
                                           v
                  +------------------------+----------------------+
                  | Personalized Sequenced Learning Path (JSON)   |
                  +-----------------------------------------------+
```

### Topic Mapping System
To interface with both the offline Sandbox mode and the online Cloud Function, the 12 sliders are mapped to the 5 main Firestore catalog tracks:

1. **Network Foundations**:
   $$\text{Score} = \frac{\text{OSI Model} + \text{TCP/IP \& Subnetting} + \text{Core Protocols}}{3}$$
2. **Data Center**:
   $$\text{Score} = \frac{\text{EOS Familiarity} + \text{Leaf-Spine} + \text{VXLAN/EVPN} + \text{Data Center Ops}}{4}$$
3. **Campus**:
   $$\text{Score} = \frac{\text{Campus Design} + \text{OSI Model}}{2}$$
4. **Automation**:
   $$\text{Score} = \frac{\text{Network Automation} + \text{Telemetry \& Monitoring}}{2}$$
5. **WAN Routing**:
   $$\text{Score} = \frac{\text{Core Protocols} + \text{Troubleshooting Methodology}}{2}$$

---

## 4. Path Personalization Rules
- **Prerequisite Enforcement**: The engine filters out assets that have prerequisites matching topics where the user scored $< 4$ until those prerequisite assets are placed earlier in the timeline.
- **Difficulty Thresholding**:
  - The maximum difficulty level of recommended assets is determined by:
    $$\text{Max Asset Difficulty} \le \text{Mapped Track Score} + 2$$
  - This ensures users are not recommended material that is too advanced, while still pushing them slightly to learn.
