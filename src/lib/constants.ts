export const BERLIN: [number, number] = [13.405, 52.52];

export const SATELLITE_STYLE = {
	version: 8,
	sources: {
		satellite: {
			type: 'raster',
			tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
			tileSize: 256
		},
		reference: {
			type: 'raster',
			tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
			tileSize: 256
		},
		terrain: {
			type: 'raster-dem',
			tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
			encoding: 'terrarium',
			tileSize: 256
		}
	},
	layers: [
		{ id: 'satellite-layer', type: 'raster', source: 'satellite' },
		{ id: 'reference-layer', type: 'raster', source: 'reference' }
	]
};
