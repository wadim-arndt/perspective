import { perspectiveState } from './usePerspectiveState.svelte';
import { geocodingService } from '../services/geocoding';

export function useSearch() {
	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

	const performSearch = async (query: string) => {
		if (!query.trim() || !perspectiveState.map) return;
		
		perspectiveState.setSearching(true);
		perspectiveState.clearVisitedCities();

		// Exit cosmic mode if active
		if (perspectiveState.isInCosmicMode) {
			perspectiveState.setCosmicMode(false);
			perspectiveState.setVirtualZoom(13);
		}

		try {
			const data = await geocodingService.search(query);
			if (data && data.length > 0) {
				const { lat, lon, address } = data[0];
				const destination: [number, number] = [parseFloat(lon), parseFloat(lat)];
				
				perspectiveState.setCountryData(destination, query, address?.country_code || null);
				perspectiveState.setAppState('zooming_out');
				
				// Disable interactivity during travel
				const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
				methods.forEach(m => perspectiveState.map![m].disable());

				// Stage 1: Zoom out to space view
				perspectiveState.map.flyTo({
					zoom: 0,
					speed: 0.4,
					curve: 1.2,
					pitch: 0,
					essential: true
				});
				
				perspectiveState.map.once('moveend', () => {
					if (perspectiveState.appState === 'zooming_out') {
						perspectiveState.setAppState('zooming_in');
						
						// Stage 2: Zoom in to target destination
						perspectiveState.map!.flyTo({
							center: destination,
							zoom: 5.5,
							speed: 0.4,
							curve: 1.2,
							pitch: 25,
							essential: true
						});
						
						perspectiveState.map!.once('moveend', () => {
							if (perspectiveState.appState === 'zooming_in') {
								perspectiveState.setAppState('arrived');
								
								// Re-enable interactivity
								const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
								methods.forEach(m => perspectiveState.map![m].enable());
							}
						});
					}
				});
			}
		} catch (err) {
			console.error('Search failed', err);
		} finally {
			perspectiveState.setSearching(false);
		}
	};

	const debouncedSearch = (query: string) => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => performSearch(query), 300);
	};

	return {
		performSearch,
		debouncedSearch
	};
}
