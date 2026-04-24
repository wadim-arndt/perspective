export interface LocationContext {
	lng: number;
	lat: number;
	city: string;
	state: string;
	country: string;
	distanceFromHome?: number;
	population?: number | string;
	timezone?: string;
}

export type AppState = 'idle' | 'zooming_out' | 'zooming_in' | 'arrived' | 'wandering' | 'returning';
