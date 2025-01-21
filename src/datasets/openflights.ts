import {
  LatLonDeg,
  Position,
  Distance,
  PositionFunction,
  DistanceFunction,
} from "./types";

import datasetUntyped from "./openflights.json";

const { airports, routes } = datasetUntyped as {
  airports: LatLonDeg[];
  routes: [number, number][];
};

export function getNumAirports(): number {
  return airports.length;
}

export function getPositions(positionFunction: PositionFunction): Position[] {
  const positions: Position[] = [];

  for (const [latDeg, lonDeg] of airports) {
    const [lat, lon] = [deg2rad(latDeg), deg2rad(lonDeg)];
    positions.push(positionFunction([lat, lon]));
  }

  return positions;
}

export function getDistances(distanceFunction: DistanceFunction): Distance[] {
  const distances: Distance[] = [];

  for (const route of routes) {
    const [ix1, ix2] = route;
    const [latDeg1, lonDeg1] = airports[ix1]!;
    const [latDeg2, lonDeg2] = airports[ix2]!;

    const distance = distanceFunction(
      [deg2rad(latDeg1), deg2rad(lonDeg1)],
      [deg2rad(latDeg2), deg2rad(lonDeg2)]
    );

    distances.push([ix1, ix2, distance]);
  }

  return distances;
}

// const globeRadius = 6371.009;
const globeRadius = 200;

export const globePosition: PositionFunction = ([lat, lon]) => {
  const cosLat = Math.cos(lat);
  return [
    globeRadius * cosLat * Math.sin(lon),
    -globeRadius * Math.sin(lat),
    -globeRadius * cosLat * Math.cos(lon),
  ];
};

export const globeDistance: DistanceFunction = ([lat1, lon1], [lat2, lon2]) => {
  // Haversine formula
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const havLat = Math.sin(dLat / 2) ** 2;
  const havLon = Math.sin(dLon / 2) ** 2;

  const a_term = havLat + Math.cos(lat1) * Math.cos(lat2) * havLon;
  const c = 2 * Math.atan2(Math.sqrt(a_term), Math.sqrt(1 - a_term));

  return globeRadius * c; // Distance in same units as radius
};

export const globeChordDistance: DistanceFunction = (
  [lat1, lon1],
  [lat2, lon2]
) => {
  const [x1, y1, z1] = globePosition([lat1, lon1]);
  const [x2, y2, z2] = globePosition([lat2, lon2]);

  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2);
};

// const gleasonRadius = globeRadius * Math.PI;
const gleasonRadius = 200;

export const gleasonPosition: PositionFunction = ([lat, lon]) => {
  const r = 0.5 - lat / Math.PI;
  return [
    gleasonRadius * r * Math.cos(lon),
    gleasonRadius * r * Math.sin(lon),
    0,
  ];
};

export const gleasonDistance: DistanceFunction = (
  [lat1, lon1],
  [lat2, lon2]
) => {
  const [x1, y1] = gleasonPosition([lat1, lon1]);
  const [x2, y2] = gleasonPosition([lat2, lon2]);

  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
};

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}
