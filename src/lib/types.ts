export interface LocationContext {
	lng: number;
	lat: number;
	city: string;
	state: string;
	country: string;
	distanceFromHome?: number;
}

export type AppState = 'idle' | 'zooming_out' | 'zooming_in' | 'arrived' | 'wandering' | 'returning';
