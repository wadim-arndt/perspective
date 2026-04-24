import type { AppState, LocationContext } from '../types';
import { BERLIN } from '../constants';
import type { Map as MapLibreMap } from 'maplibre-gl';

class PerspectiveState {
	// ─── State ───────────────────────────────────────────────────────────────
	map = $state<MapLibreMap | null>(null);
	appState = $state<AppState>('idle');
	currentZoom = $state(13);
	virtualZoom = $state(13);
	homeLocation = $state<[number, number]>(BERLIN);
	isInCosmicMode = $state(false);
	currentLocationContext = $state<LocationContext | null>(null);
	visitedCities = $state<Set<string>>(new Set());
	countryOverviewCenter = $state<[number, number] | null>(null);
	lastSearchQuery = $state('');
	lastCountryCode = $state<string | null>(null);
	isSearching = $state(false);

	// ─── Actions ─────────────────────────────────────────────────────────────
	setMap(map: MapLibreMap | null) {
		this.map = map;
	}

	setAppState(state: AppState) {
		this.appState = state;
	}

	setZoom(zoom: number) {
		this.currentZoom = zoom;
		if (!this.isInCosmicMode) {
			this.virtualZoom = zoom;
		}
	}

	setVirtualZoom(zoom: number) {
		this.virtualZoom = zoom;
	}

	setCosmicMode(active: boolean) {
		this.isInCosmicMode = active;
	}

	setHomeLocation(lng: number, lat: number) {
		this.homeLocation = [lng, lat];
	}

	setSearching(active: boolean) {
		this.isSearching = active;
	}

	setLocationContext(context: LocationContext | null) {
		this.currentLocationContext = context;
	}

	setCountryData(center: [number, number], query: string, code: string | null) {
		this.countryOverviewCenter = center;
		this.lastSearchQuery = query;
		this.lastCountryCode = code;
	}

	clearVisitedCities() {
		this.visitedCities.clear();
	}

	addVisitedCity(city: string) {
		this.visitedCities.add(city);
	}

	// ─── Computed / Derived ──────────────────────────────────────────────────
	getLocalTime() {
		if (!this.currentLocationContext?.timezone) return '--:--';
		return new Intl.DateTimeFormat('en-US', {
			timeZone: this.currentLocationContext.timezone,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: true
		}).format(new Date());
	}
}

export const perspectiveState = new PerspectiveState();
