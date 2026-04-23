import { perspectiveState } from './usePerspectiveState.svelte';

export function useCosmic() {
	const handleWheel = (e: WheelEvent) => {
		const map = perspectiveState.map;
		if (!map) return;
		
		const mapZoom = map.getZoom();

		// Custom fixed-anchor zoom for wandering mode
		if (perspectiveState.appState === 'wandering' && perspectiveState.currentLocationContext && !perspectiveState.isInCosmicMode) {
			e.preventDefault();
			e.stopPropagation();
			
			if (mapZoom <= 0.5 && e.deltaY > 0) {
				perspectiveState.setCosmicMode(true);
				const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
				methods.forEach(m => map[m].disable());
				perspectiveState.setVirtualZoom(mapZoom);
				return;
			}
			
			let delta = e.deltaY;
			if (e.deltaMode === 1) delta *= 40;
			else if (e.deltaMode === 2) delta *= 800;

			const zoomDelta = delta * -0.005;
			const newZoom = Math.max(0.5, Math.min(22, mapZoom + zoomDelta));
			
			map.jumpTo({
				center: [perspectiveState.currentLocationContext.lng, perspectiveState.currentLocationContext.lat],
				zoom: newZoom
			});
			return;
		}
		
		if (!perspectiveState.isInCosmicMode && mapZoom <= 0.5 && e.deltaY > 0) {
			perspectiveState.setCosmicMode(true);
			const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
			methods.forEach(m => map[m].disable());
			perspectiveState.setVirtualZoom(mapZoom);
		}
		
		if (perspectiveState.isInCosmicMode) {
			e.preventDefault();
			e.stopPropagation();
			
			const delta = e.deltaY * 0.002;
			perspectiveState.setVirtualZoom(Math.max(-2.5, Math.min(0.5, perspectiveState.virtualZoom - delta)));
			
			if (perspectiveState.virtualZoom >= 0.5) {
				perspectiveState.setCosmicMode(false);
				perspectiveState.setVirtualZoom(0.5);
				if (['idle', 'arrived', 'wandering'].includes(perspectiveState.appState)) {
					const methods = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'] as const;
					methods.forEach(m => map[m].enable());
				}
				map.jumpTo({ zoom: 0.5 });
			}
		}
	};

	return {
		handleWheel
	};
}
