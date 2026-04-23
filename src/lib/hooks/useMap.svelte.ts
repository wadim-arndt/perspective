import { perspectiveState } from './usePerspectiveState.svelte';
import { SATELLITE_STYLE } from '../constants';

export function useMap() {
	const initMap = (maplibregl: any, container: HTMLElement, center: [number, number]) => {
		const map = new maplibregl.Map({
			container,
			style: SATELLITE_STYLE as any,
			center,
			zoom: 13,
			pitch: 45,
			maxPitch: 85,
			bearing: 0,
			antialias: true,
			attributionControl: false
		});

		map.on('zoom', () => {
			perspectiveState.setZoom(map.getZoom());
		});

		map.on('load', () => {
			map.setTerrain({ source: 'terrain', exaggeration: 1.5 });
		});

		perspectiveState.setMap(map);
		return map;
	};

	const toggleInteractivity = (enabled: boolean) => {
		const map = perspectiveState.map;
		if (!map) return;
		const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
		methods.forEach(method => map[method][enabled ? 'enable' : 'disable']());
	};

	const flyTo = (options: any) => {
		perspectiveState.map?.flyTo({
			essential: true,
			...options
		});
	};

	return {
		initMap,
		toggleInteractivity,
		flyTo
	};
}
