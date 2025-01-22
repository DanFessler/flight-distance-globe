import "./style.css";

import * as OF from "./datasets/openflights";

function main() {
  const canvas = document.createElement("canvas");
  if (!canvas) {
    throw new Error(`document.createElement("canvas") failed`);
  }
  canvas.width = 800;
  canvas.height = 600;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(`canvasEl.getContext("2d") failed`);
  }

  document.body.appendChild(canvas);

  ctx.fillStyle = "red";
  ctx.fillRect(10, 10, 100, 100);

  const game = new Game(canvas, ctx);
  game.start();
}

/** An index in the points array. */
type Ix = number;
/** An index in the dataset. */
type DatasetIx = number;

type Vec = {
  x: number;
  y: number;
  z: number;
};

type Point = {
  datasetIx: DatasetIx;
  x: number;
  y: number;
  z: number;
  distances: Distance[];
};

type Distance = {
  /** An index in the points array (not the dataset). */
  ix: Ix;
  /** The desired distance. */
  distance: number;
};

class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  interval: number = 1000 / 60;
  lastTime: number = 0;

  /** The number of iterations to wait until adding the next airport. */
  addNextAirportInterval: number = 5;
  addNextAirportIterations: number = 0;

  /** Established airports. Only connected to each other. */
  points: Point[];
  /** A map from dataset indices to airports array indices. */
  airportIndices: Map<DatasetIx, Ix>;
  /** Unestablished routes from the established airports. Directional. */
  nextRoutes: Map<DatasetIx, [DatasetIx, number][]>;
  /**
   * The rest of the routes. Directional and initially stored once for each
   * direction.
   */
  futureRoutes: Map<DatasetIx, Map<DatasetIx, number>>;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;

    this.points = [];
    this.airportIndices = new Map();
    this.nextRoutes = new Map();
    this.futureRoutes = new Map();

    // const distanceFunction = OF.globeDistance;
    const distanceFunction = OF.globeChordDistance;
    // const distanceFunction = OF.gleasonDistance;
    for (const [ix1, ix2, distance] of OF.getDistances(distanceFunction)) {
      this.addFutureRoute(ix1, ix2, distance);
    }

    this.addInitialAirport();
  }

  /** Add a route which is not connected to the established airports. */
  addFutureRoute(ix1: DatasetIx, ix2: DatasetIx, distance: number): void {
    getMapValueOrSetDefault(this.futureRoutes, ix1, () => new Map()).set(
      ix2,
      distance
    );
    getMapValueOrSetDefault(this.futureRoutes, ix2, () => new Map()).set(
      ix1,
      distance
    );
  }

  /**
   * Move a future route to next routes. To be used when an airport is being
   * added, potentially making some of the future routes connected to it.
   */
  moveToNextRoutes(ix: DatasetIx): void {
    const futureRouteEntry = this.futureRoutes.get(ix);
    if (futureRouteEntry === undefined) {
      // No future routes for the airport.
      return;
    }
    this.futureRoutes.delete(ix);

    const nextRouteEntry = Array.from(futureRouteEntry);
    this.nextRoutes.set(ix, nextRouteEntry);
  }

  addInitialAirport(): void {
    if (this.points.length > 0) {
      throw new Error("Initial airport already added");
    }

    // Pick a random starting point.
    const startIx = Math.floor(Math.random() * OF.getNumAirports());

    const point = { datasetIx: startIx, x: 0, y: 0, z: 0, distances: [] };

    const routes = this.futureRoutes.get(startIx);
    if (routes === undefined) {
      throw new Error(`No routes for airport ${startIx}`);
    }
    this.futureRoutes.delete(startIx);

    for (const [otherIx] of routes) {
      // The connections to unestablished airports (i.e. all of them at this
      // moment) will not be added to the point, but they still reside as
      // outgoing routes from the airports which will eventually be connected
      // to this one.

      this.moveToNextRoutes(otherIx);
    }

    this.airportIndices.set(startIx, 0);
    this.points.push(point);

    console.debug("Added initial airport", point);
  }

  /**
   * Add the next airport from nextRoutes if any. Returns true if one was
   * added.
   */
  addNextAirport(): boolean {
    let chosenIx: DatasetIx = -1;
    let chosenRoutes: [DatasetIx, number][] = [];
    let chosenRoutesEstablished: [DatasetIx, number][] = [];

    // Find the airport with the most connections to the established airports.
    for (const [ix, routes] of this.nextRoutes) {
      // The connections to unestablished airports will not be added to the
      // point, but they still reside as outgoing routes from the airports
      // which will eventually be connected to this one.
      const routesEstablished = routes.filter(([otherIx]) =>
        this.airportIndices.has(otherIx)
      );

      if (routesEstablished.length > chosenRoutesEstablished.length) {
        chosenIx = ix;
        chosenRoutes = routes;
        chosenRoutesEstablished = routesEstablished;
      }
    }

    if (chosenIx < 0) {
      console.debug("No airports to add");
      return false;
    }
    if (chosenRoutesEstablished.length === 0) {
      throw new Error(`Empty established routes for airport ${chosenIx}`);
    }

    this.nextRoutes.delete(chosenIx);

    const point: Point = {
      datasetIx: chosenIx,
      x: 0,
      y: 0,
      z: 0,
      distances: [],
    };

    for (const [otherIx, distance] of chosenRoutesEstablished) {
      const otherPointIx = this.airportIndices.get(otherIx);
      if (otherPointIx === undefined) {
        throw new Error(`arrayIx not found for datasetIx ${otherIx}`);
      }
      const otherPoint = this.points[otherPointIx];
      if (otherPoint === undefined) {
        throw new Error(
          `Point not found for datasetIx ${otherIx}, arrayIx ${otherPointIx}`
        );
      }

      // Connect the established airports.
      point.distances.push({ ix: otherPointIx, distance });
      otherPoint.distances.push({ ix: this.points.length, distance });

      // Use the average of the connected established airports as the initial
      // position.
      point.x += otherPoint.x;
      point.y += otherPoint.y;
      point.z += otherPoint.z;
    }

    point.x /= chosenRoutesEstablished.length;
    point.y /= chosenRoutesEstablished.length;
    point.z /= chosenRoutesEstablished.length;

    for (const [otherIx] of chosenRoutes) {
      this.moveToNextRoutes(otherIx);
    }

    this.airportIndices.set(chosenIx, this.points.length);
    this.points.push(point);

    console.debug("Added airport", point);

    return true;
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.update.bind(this));
  }

  update() {
    this.simulate();
    this.render();
    requestAnimationFrame(this.update.bind(this));

    if (this.nextRoutes.size > 0) {
      ++this.addNextAirportIterations;
      if (this.addNextAirportIterations >= this.addNextAirportInterval) {
        this.addNextAirportIterations = 0;
        this.addNextAirport();
      }
    }
  }

  simulate() {
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]!;
      for (let j = 0; j < point.distances.length; j++) {
        const distanceObj = point.distances[j]!;
        // if (distanceObj.distance > 80) continue;
        const otherPoint = this.points[distanceObj.ix]!;

        const dx = otherPoint.x - point.x;
        const dy = otherPoint.y - point.y;
        const dz = otherPoint.z - point.z;
        const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // const currentDistance = greatCircleDistance(point, otherPoint);

        let dirX: number, dirY: number, dirZ: number;
        if (currentDistance > 0) {
          dirX = dx / currentDistance;
          dirY = dy / currentDistance;
          dirZ = dz / currentDistance;
        } else {
          // If the points are at the same position, choose a random direction.
          dirX = Math.random() * 2 - 1;
          dirY = Math.random() * 2 - 1;
          dirZ = Math.random() * 2 - 1;
          const dirLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
          dirX /= dirLength;
          dirY /= dirLength;
          dirZ /= dirLength;
        }

        const targetX =
          point.x + dirX * (currentDistance - distanceObj.distance);
        const targetY =
          point.y + dirY * (currentDistance - distanceObj.distance);
        const targetZ =
          point.z + dirZ * (currentDistance - distanceObj.distance);
        const target = { x: targetX, y: targetY, z: targetZ };

        const newPos = lerp3d(point, target, 0.001);
        point.x = newPos.x;
        point.y = newPos.y;
        point.z = newPos.z;
      }
    }

    // find averaged origin
    const origin = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]!;
      origin.x += point.x;
      origin.y += point.y;
      origin.z += point.z;
    }
    origin.x /= this.points.length;
    origin.y /= this.points.length;
    origin.z /= this.points.length;

    // center and rotate the points
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]!;
      point.x -= origin.x;
      point.y -= origin.y;
      point.z -= origin.z;

      const angle = 0.001;
      const x = point.x;
      const z = point.z;
      point.x = x * Math.cos(angle) - z * Math.sin(angle);
      point.z = x * Math.sin(angle) + z * Math.cos(angle);
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Perspective projection parameters
    const fov = 40; // Field of view in degrees
    const fovRad = (fov * Math.PI) / 180;
    const projectionDistance = this.canvas.height / (2 * Math.tan(fovRad / 2));

    // Project points to 2D with perspective
    const projectedPoints = this.points.map((point) => {
      const scale = projectionDistance / (projectionDistance + point.z);
      return {
        ...point,
        projectedX: this.canvas.width / 2 + point.x * scale,
        projectedY: this.canvas.height / 2 + point.y * scale,
        scale: scale,
      };
    });

    // Sort points by z for proper rendering order
    const sortedPoints = projectedPoints.toSorted((a, b) => b.z - a.z);

    // Draw connections first
    for (let ix = 0; ix < sortedPoints.length; ix++) {
      const point = sortedPoints[ix]!;
      const distances = point.distances;
      // distances.sort((a, b) => a.distance - b.distance);
      // distances = distances.slice(0, 10);
      distances.forEach((distanceObj) => {
        const otherPoint = projectedPoints[distanceObj.ix];
        // const otherPoint = projectedPoints.find((p) => p.ix === distanceObj.ix);
        if (!otherPoint) return;
        // console.log("sorted", sortedPoints);

        // Calculate actual distance between points
        const dx = point.x - otherPoint.x;
        const dy = point.y - otherPoint.y;
        const dz = point.z - otherPoint.z;
        const actualDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (actualDistance > 35) return;

        if (distanceObj.ix > ix) {
          // Calculate difference ratio between actual and target distance
          const difference = actualDistance - distanceObj.distance;
          const maxDifference = 200; // Adjust this to control color intensity
          const ratio =
            Math.max(-1, Math.min(1, difference / maxDifference)) / 2 + 0.5;

          // Red when negative (too close), green when positive (too far)
          const color = hsvToRgb(ratio, 1, 1);

          const alpha = Math.max(0, Math.min(1, 1 - (point.z + 400) / 800));

          this.ctx.beginPath();
          this.ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
          this.ctx.moveTo(point.projectedX, point.projectedY);
          this.ctx.lineTo(otherPoint.projectedX, otherPoint.projectedY);
          this.ctx.stroke();
        }
      });
    }

    // Draw points on top
    // sortedPoints.forEach((point) => {
    //   const baseSize = 3;
    //   const size = Math.max(1, baseSize * point.scale);
    //   const alpha = Math.max(0.2, Math.min(1, 1 - (point.z + 400) / 800));

    //   this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    //   this.ctx.beginPath();
    //   this.ctx.arc(point.projectedX, point.projectedY, size, 0, Math.PI * 2);
    //   this.ctx.fill();
    // });
  }
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      [r, g, b] = [v, t, p];
      break;
    case 1:
      [r, g, b] = [q, v, p];
      break;
    case 2:
      [r, g, b] = [p, v, t];
      break;
    case 3:
      [r, g, b] = [p, q, v];
      break;
    case 4:
      [r, g, b] = [t, p, v];
      break;
    default:
      [r, g, b] = [v, p, q];
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3d(a: Vec, b: Vec, t: number): Vec {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function getMapValueOrSetDefault<K, V>(
  map: Map<K, V>,
  key: K,
  defaultValue: () => V
): V {
  let value = map.get(key);
  if (value !== undefined) {
    return value;
  }

  value = defaultValue();
  map.set(key, value);
  return value;
}

main();
