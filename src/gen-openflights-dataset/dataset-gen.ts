import { LatLonDeg } from "../datasets/types";
import * as OF from "./openflights";

export type Dataset = {
  airports: DatasetAirport[];
  routes: DatasetRoute[];
};

export type DatasetAirport = LatLonDeg;
/** [ix, ix] */
export type DatasetRoute = [number, number];

export async function datasetGen(directory: string): Promise<Dataset> {
  return await new DatasetGen().run(directory);
}

type ICAO = string;

type Airport = {
  /** OpenFlights internal ID. */
  id: number;
  /** Airport IATA code. */
  iata: string | null;
  /** Airport ICAO code. */
  icao: ICAO;
  /** Latitude. */
  lat: number;
  /** Longitude. */
  lon: number;
  /** The set of routes, not distinguishing between incoming and outgoing. */
  routes: Set<ICAO>;
};

class DatasetGen {
  /** Mapping from OpenFlights internal ID to ICAO code. */
  #idIcao: Map<number, ICAO>;
  /** Mapping from IATA code to ICAO code. */
  #iataIcao: Map<string, ICAO>;
  /** The airport data indexed by the ICAO code. */
  #airports: Map<ICAO, Airport>;

  constructor() {
    this.#idIcao = new Map();
    this.#iataIcao = new Map();
    this.#airports = new Map();
  }

  async run(directory: string): Promise<Dataset> {
    await this.#parse(directory);
    this.#prune();
    this.#ensureConnected();
    return this.#generate();
  }

  async #parse(directory: string): Promise<void> {
    await OF.parse(
      `${directory}/airports.dat`,
      OF.AirportSchema,
      (ofAirport) => {
        const { id, iata, icao, lat, lon } = ofAirport;

        this.#idIcao.set(id, icao);
        if (iata != null) {
          this.#iataIcao.set(iata, icao);
        }

        const airport = { id, iata, icao, lat, lon, routes: new Set<ICAO>() };
        this.#airports.set(icao, airport);
      }
    );

    await OF.parse(`${directory}/routes.dat`, OF.RouteSchema, (ofRoute) => {
      const {
        srcAirportCode,
        srcAirportId,
        dstAirportCode,
        dstAirportId,
        stops,
      } = ofRoute;

      if (stops !== 0) {
        console.debug("Skipping non-direct route:", ofRoute);
        return;
      }

      const srcAirport = this.getAirport(srcAirportId, srcAirportCode);
      const dstAirport = this.getAirport(dstAirportId, dstAirportCode);

      if (srcAirport == null) {
        console.debug(
          "Skipping route: no airport found matching id:",
          srcAirportId,
          "code:",
          srcAirportCode,
          "route:",
          ofRoute
        );
        return;
      }
      if (dstAirport == null) {
        console.debug(
          "Skipping route: no airport found matching id:",
          dstAirportId,
          "code:",
          dstAirportCode,
          "route:",
          ofRoute
        );
        return;
      }

      if (srcAirport.id === dstAirport.id) {
        console.debug(
          "Skipping route with the same source and destination:",
          ofRoute
        );
        return;
      }

      // Add the route to both directions.
      srcAirport.routes.add(dstAirport.icao);
      dstAirport.routes.add(srcAirport.icao);
    });

    console.debug(
      "Parse: Added",
      this.countAirports(),
      "airports,",
      this.countRoutes(),
      "routes"
    );
  }

  getAirport(id: number | null, code: string | null): Airport | undefined {
    const icao =
      (id != null ? this.#idIcao.get(id) : null) ??
      (code != null ? this.#iataIcao.get(code) : null) ??
      code;

    if (icao == null) {
      return;
    }

    return this.#airports.get(icao);
  }

  #prune(): void {
    const checkSet = new Set(this.#airports.keys());

    while (checkSet.size > 0) {
      const icao = setShift(checkSet)!;

      const airport = this.#airports.get(icao)!;

      // Two routes are not enough for the spring simulation to constrain the
      // vertex to the surface.
      if (airport.routes.size < 3) {
        console.debug("Pruning airport: fewer than 3 routes:", airport);

        for (const otherIcao of airport.routes) {
          // Remove this airport from the other one's routes.
          const otherAirport = this.#airports.get(otherIcao)!;
          if (!otherAirport.routes.delete(icao)) {
            throw new Error(
              `Assertion failure: The airport ${JSON.stringify(
                otherAirport
              )} does not have ${icao} in its routes`
            );
          }

          if (otherAirport.routes.size < 3) {
            // Deal with the other one as it has too few routes now.
            checkSet.add(otherIcao);
          }
        }

        // Remove this airport.
        this.#airports.delete(icao);
        this.#idIcao.delete(airport.id);
        if (airport.iata != null) {
          this.#iataIcao.delete(airport.iata);
        }
      }
    }

    console.debug(
      "Prune: Have",
      this.countAirports(),
      "airports,",
      this.countRoutes(),
      "routes"
    );
  }

  #ensureConnected(): void {
    const visited = new Set<ICAO>();
    const checkQueue: ICAO[] = [];

    const startIcao = this.#airports.keys().next().value!;
    checkQueue.push(startIcao);

    while (checkQueue.length > 0) {
      const icao = checkQueue.shift()!;
      if (visited.has(icao)) {
        continue;
      }

      visited.add(icao);

      const airport = this.#airports.get(icao)!;
      for (const otherIcao of airport.routes) {
        checkQueue.push(otherIcao);
      }
    }

    if (visited.size !== this.#airports.size) {
      throw new Error(
        `The graph is not connected: ${visited.size} of ${
          this.#airports.size
        } reached starting from ${JSON.stringify(startIcao)}`
      );
    }
  }

  #generate(): Dataset {
    const airportIndices = new Map<ICAO, number>();
    /** [latDeg, lonDeg] */
    const airports: DatasetAirport[] = [];
    let nextIx = 0;

    for (const airport of this.#airports.values()) {
      const ix = nextIx++;
      airportIndices.set(airport.icao, ix);
      airports.push([airport.lat, airport.lon]);
    }

    /** [ix, ix] */
    const routes: DatasetRoute[] = [];

    for (const airport of this.#airports.values()) {
      const srcIx = airportIndices.get(airport.icao)!;
      for (const otherIcao of airport.routes) {
        const dstIx = airportIndices.get(otherIcao)!;
        if (srcIx < dstIx) {
          routes.push([srcIx, dstIx]);
        }
      }
    }

    return { airports, routes };
  }

  countAirports(): number {
    return this.#airports.size;
  }

  countRoutes(): number {
    let count = 0;

    for (const airport of this.#airports.values()) {
      count += airport.routes.size;
    }

    // Routes are counted once for each direction.
    return count / 2;
  }
}

function setShift<T>(set: Set<T>): T | undefined {
  const value = set.values().next().value;
  if (value != null) {
    set.delete(value);
  }
  return value;
}
