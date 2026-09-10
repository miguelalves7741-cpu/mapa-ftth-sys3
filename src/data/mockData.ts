import { OnuData } from "@/types";

export const mockOnus: OnuData[] = [
  {
    pon: 1, olt_id: 32, id: 1, onu: 1, slot: 1, olt_name: "teste",
    type: "5506-01-a1", phy_addr: "FHTT8778ad31", mode: "Bridge",
    lat: -7.11532, lng: -34.86100, coordSource: "endereco", status: "offline"
  },
  {
    pon: 1, olt_id: 32, id: 3, onu: 1, slot: 1, olt_name: "teste",
    service_cliente: "VALDELICE SILVA E SILVA", type: "5506-01-a1",
    phy_addr: "FHTT8778ad50", service_contrato: 449, mode: "PPPoE",
    service_login: "5225", lat: -7.12000, lng: -34.87000, coordSource: "endereco", status: "online"
  },
  {
    pon: 2, olt_id: 32, id: 4, onu: 1, slot: 1, olt_name: "teste",
    service_cliente: "PAULA NADYNE", type: "AN5506-02-B",
    phy_addr: "ftth010abcd", service_contrato: 328, mode: "PPPoE",
    service_login: "teste", lat: -7.12500, lng: -34.87500, coordSource: "endereco", status: "online"
  }
];
