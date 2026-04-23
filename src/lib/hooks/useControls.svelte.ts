import { perspectiveState } from './usePerspectiveState.svelte';

interface ControlsDependencies {
	wandering: { stop: () => void; returnToCountry: () => void };
	mapHelper: { toggleInteractivity: (enabled: boolean) => void };
	cosmic: { handleWheel: (e: WheelEvent) => void };
}

export function useControls(deps: ControlsDependencies) {
	const handleKeydown = (e: KeyboardEvent) => {
		if (e.target instanceof HTMLInputElement) return;

		// Exit wandering/exploration
		if (e.code === 'KeyQ' && perspectiveState.appState === 'wandering') {
			deps.wandering.stop();
			deps.wandering.returnToCountry();
			return;
		}

		// Spacebar: Return to home location
		if (e.code === 'Space' && perspectiveState.map && perspectiveState.appState !== 'zooming_out' && perspectiveState.appState !== 'zooming_in') {
			e.preventDefault();
			
			if (perspectiveState.isInCosmicMode) {
				perspectiveState.setCosmicMode(false);
				perspectiveState.setVirtualZoom(13);
			}
			
			if (perspectiveState.appState === 'wandering') {
				deps.wandering.stop();
				perspectiveState.setLocationContext(null);
			}

			perspectiveState.setAppState('zooming_out');
			deps.mapHelper.toggleInteractivity(false);

			perspectiveState.map.flyTo({
				center: perspectiveState.homeLocation,
				zoom: 13,
				speed: 0.8,
				curve: 1,
				essential: true
			});
			
			perspectiveState.map.once('moveend', () => {
				if (perspectiveState.appState === 'zooming_out') {
					perspectiveState.setAppState('idle');
					deps.mapHelper.toggleInteractivity(true);
				}
			});
		}
	};

	const setup = (container: HTMLElement | null) => {
		window.addEventListener('keydown', handleKeydown);
		if (container) {
			container.addEventListener('wheel', deps.cosmic.handleWheel as EventListener, { 
				passive: false, 
				capture: true 
			});
		}
	};

	const cleanup = (container: HTMLElement | null) => {
		window.removeEventListener('keydown', handleKeydown);
		if (container) {
			container.removeEventListener('wheel', deps.cosmic.handleWheel as EventListener, { 
				capture: true 
			});
		}
	};

	return {
		setup,
		cleanup
	};
}
