import type { LatLon, Vec3 } from "./types";
/**
 * Convert latitude, longitude, and optional altitude to Cartesian coordinates.
 * @param latLon Latitude and longitude in degrees, optional altitude in meters
 * @param radius Earth's radius in meters (default 6371000 m)
 * @returns Cartesian coordinates {x, y, z} in meters
 */
export function latLonToCartesian(latLon: LatLon & {alt?: number}, radius = 6371000): Vec3 {
  const { lat, lon, alt = 0 } = latLon;

  // Convert degrees to radians
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const r = radius + alt;

  const x = r * Math.cos(latRad) * Math.cos(lonRad);
  const y = r * Math.cos(latRad) * Math.sin(lonRad);
  const z = r * Math.sin(latRad);

  return { x, y, z };
}


/**
 * Convert Cartesian coordinates back to latitude, longitude, and altitude.
 * @param cart Cartesian coordinates {x, y, z} in meters
 * @returns LatLon {lat, lon, alt} where lat/lon in degrees, alt in meters
 */
export function cartesianToLatLon(cart: Vec3): LatLon {
  const { x, y, z } = cart;

  const r = Math.sqrt(x * x + y * y + z * z);
  const latRad = Math.asin((z??0) / r);
  const lonRad = Math.atan2(y, x);

  const lat = (latRad * 180) / Math.PI;
  const lon = (lonRad * 180) / Math.PI;

  return { lat, lon };
}

export function polygonWinding(cart: Vec3[]): 1 | -1 {
  let sum = 0;

  for (let i = 0; i < cart.length; i++) {
    const p1 = cart[i];
    const p2 = cart[(i + 1) % cart.length];
    sum += (p2.x - p1.x) * (p2.y + p1.y);
  }

  // CCW → positive, CW → negative
  return sum > 0 ? 1 : -1;
}

export const offsetPolygon = (polygon: LatLon[], offsetDistance = 1): LatLon[] => {
    const winding = polygonWinding(polygon.map(p => ({x: p.lon, y: p.lat, z: 0})));
    const offsetPolygon: LatLon[] = [];
    for(let i = 0; i < (polygon.length - 1); i++) {
        const p1 = polygon[i];
        const p2 = polygon[i+1];

        const vx = p2.lon - p1.lon;
        const vy = p2.lat - p1.lat;

        if (Math.abs(vx) < 0.1 || Math.abs(vy) < 0.1) continue;

        const magnitude = Math.sqrt(vx*vx+vy*vy);

        const normalizedNormal = {
            nx: vy/magnitude,
            ny: -vx/magnitude
        };

        const offset = {
            lon:offsetDistance * normalizedNormal.nx * winding,
            lat:offsetDistance * normalizedNormal.ny * winding
        }

        const point = {lon: p1.lon + offset.lon, lat: p1.lat + offset.lat, offset: true};

        offsetPolygon.push(point);
    }
    return offsetPolygon;
}