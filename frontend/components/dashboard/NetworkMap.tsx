"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface FacilityPoint {
  id: string;
  name: string;
  county: string;
  latitude: number;
  longitude: number;
  simulated: boolean;
}

export default function NetworkMap({ facilities }: { facilities: FacilityPoint[] }) {
  return (
    <div className="map-frame">
      <MapContainer center={[-0.8, 36.3]} zoom={6} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {facilities.map((facility) => (
          <CircleMarker
            key={facility.id}
            center={[facility.latitude, facility.longitude]}
            radius={7}
            pathOptions={{ color: "#f06470", fillColor: "#e54858", fillOpacity: 0.9 }}
          >
            <Popup>{facility.name} · {facility.county}{facility.simulated ? " · Simulated" : ""}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
