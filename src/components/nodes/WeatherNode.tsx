import { useCallback, useEffect, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import {
  Cloud, Wind, Droplets, Trash2,
  Sun, CloudSun, CloudFog, CloudDrizzle, CloudRain, Snowflake, CloudLightning, Thermometer,
} from "lucide-react";
import { useStore } from "../../store";
import { MindNode, WeatherData } from "../../types";

export type WeatherNodeType = Node<{ mindNode: MindNode }, "weather">;

const WMO_LABEL: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Heavy showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm",
};

const WMO_ICON: Record<number, typeof Sun> = {
  0: Sun,
  1: CloudSun, 2: CloudSun, 3: Cloud,
  45: CloudFog, 48: CloudFog,
  51: CloudDrizzle, 53: CloudDrizzle, 55: CloudRain,
  61: CloudRain, 63: CloudRain, 65: CloudRain,
  71: Snowflake, 73: Snowflake, 75: Snowflake,
  80: CloudDrizzle, 81: CloudRain, 82: CloudLightning,
  95: CloudLightning, 96: CloudLightning, 99: CloudLightning,
};

interface WeatherResult {
  temp: number;
  windspeed: number;
  humidity: number;
  weathercode: number;
  cityName: string;
  country: string;
}

async function geocode(city: string): Promise<{ lat: number; lon: number; name: string; country: string }> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Geocoding failed: ${resp.status}`);
  const json = await resp.json();
  const r = json?.results?.[0];
  if (!r) throw new Error(`City not found: "${city}"`);
  return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country_code };
}

async function loadWeather(
  lat: number,
  lon: number,
  units: "celsius" | "fahrenheit"
): Promise<{ temp: number; windspeed: number; humidity: number; weathercode: number }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&temperature_unit=${units}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Weather fetch failed: ${resp.status}`);
  const json = await resp.json();
  const c = json?.current;
  return {
    temp: c?.temperature_2m ?? 0,
    windspeed: c?.windspeed_10m ?? 0,
    humidity: c?.relativehumidity_2m ?? 0,
    weathercode: c?.weathercode ?? 0,
  };
}

export function WeatherNode({ data, selected }: NodeProps<WeatherNodeType>) {
  const { mindNode } = data;
  const wd = mindNode.data as WeatherData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [result, setResult] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityInput, setCityInput] = useState(wd.city);
  const [editingCity, setEditingCity] = useState(!wd.city);

  const fetch = useCallback(
    async (city: string, lat: number | null, lon: number | null, units: "celsius" | "fahrenheit") => {
      if (!city) return;
      setLoading(true);
      setError(null);
      try {
        let rLat = lat;
        let rLon = lon;
        let cityName = city;
        let country = "";

        if (!rLat || !rLon) {
          const geo = await geocode(city);
          rLat = geo.lat;
          rLon = geo.lon;
          cityName = geo.name;
          country = geo.country;
          updateNode(mindNode.id, {
            data: { ...wd, city: cityName, latitude: rLat, longitude: rLon },
          });
        }

        const w = await loadWeather(rLat, rLon, units);
        setResult({ ...w, cityName, country });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load weather");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mindNode.id]
  );

  useEffect(() => {
    if (wd.city) fetch(wd.city, wd.latitude, wd.longitude, wd.units);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCity = useCallback(() => {
    const city = cityInput.trim();
    if (!city) return;
    setEditingCity(false);
    updateNode(mindNode.id, { data: { ...wd, city, latitude: null, longitude: null } });
    fetch(city, null, null, wd.units);
  }, [cityInput, wd, mindNode.id, updateNode, fetch]);

  const toggleUnits = useCallback(() => {
    const units = wd.units === "celsius" ? "fahrenheit" : "celsius";
    updateNode(mindNode.id, { data: { ...wd, units } });
    if (wd.latitude && wd.longitude) {
      fetch(wd.city, wd.latitude, wd.longitude, units);
    }
  }, [wd, mindNode.id, updateNode, fetch]);

  const code = result?.weathercode ?? 0;
  const WeatherIcon = WMO_ICON[code] ?? Thermometer;
  const label = WMO_LABEL[code] ?? "Unknown";
  const unitSym = wd.units === "celsius" ? "°C" : "°F";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      <div style={{ height: 3, background: "#38bdf8", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Cloud size={14} color="#38bdf8" />
        <span
          onClick={() => { setEditingCity(true); setCityInput(wd.city); }}
          title="Click to change city"
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ms-text)",
            cursor: "text",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {result?.cityName || wd.city || "Weather"}
          {result?.country ? ` · ${result.country}` : ""}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); toggleUnits(); }}
          title={`Switch to ${wd.units === "celsius" ? "°F" : "°C"}`}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 5px", color: "var(--ms-text-muted)", fontSize: 10, fontWeight: 700 }}
        >
          {unitSym}
        </button>
        <motion.button
          onClick={(e) => { e.stopPropagation(); if (wd.city) fetch(wd.city, wd.latitude, wd.longitude, wd.units); }}
          title="Refresh"
          animate={{ rotate: loading ? 360 : 0 }}
          transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-3" />
          </svg>
        </motion.button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* City input */}
      {editingCity && (
        <div style={{ padding: "4px 12px", flexShrink: 0, display: "flex", gap: 6 }}>
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyCity();
              if (e.key === "Escape") setEditingCity(false);
            }}
            placeholder="Enter city name…"
            autoFocus
            style={{
              flex: 1,
              background: "var(--ms-bg)",
              border: "1px solid var(--ms-border)",
              borderRadius: 5,
              color: "var(--ms-text)",
              fontSize: 11,
              padding: "3px 7px",
              outline: "none",
            }}
          />
          <button
            onClick={applyCity}
            style={{ background: "#38bdf8", border: "none", borderRadius: 4, color: "#000", fontSize: 10, fontWeight: 700, padding: "3px 9px", cursor: "pointer" }}
          >
            Go
          </button>
        </div>
      )}

      {/* Body */}
      <div
        className="ms-node-body"
        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}
      >
        {error && (
          <div style={{ fontSize: 11, color: "#f87171", textAlign: "center", padding: "0 4px" }}>{error}</div>
        )}
        {loading && !result && (
          <div style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>Loading…</div>
        )}
        {!wd.city && !editingCity && !loading && (
          <div style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic", textAlign: "center" }}>
            Click the city name above to set your location
          </div>
        )}
        {result && (
          <>
            <div style={{ lineHeight: 1, display: "flex", justifyContent: "center" }}>
              <WeatherIcon size={44} color="var(--ms-accent)" strokeWidth={1.4} />
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "var(--ms-text)", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {Math.round(result.temp)}{unitSym}
            </div>
            <div style={{ fontSize: 12, color: "var(--ms-text-muted)" }}>{label}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ms-text-muted)" }}>
                <Wind size={11} />
                {Math.round(result.windspeed)} km/h
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ms-text-muted)" }}>
                <Droplets size={11} />
                {result.humidity}%
              </div>
            </div>
          </>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default WeatherNode;
