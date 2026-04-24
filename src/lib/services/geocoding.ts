import type { LocationContext } from './types';

class GeocodingService {
	private cache = new Map<string, any>();
	private lastRequestTime = 0;
	private minRequestInterval = 1000; // Nominatim policy: max 1 request per second

	private async fetchWithThrottle(url: string): Promise<any> {
		const now = Date.now();
		const elapsed = now - this.lastRequestTime;
		if (elapsed < this.minRequestInterval) {
			await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - elapsed));
		}
		this.lastRequestTime = Date.now();

		if (this.cache.has(url)) {
			return this.cache.get(url);
		}

		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
			const data = await res.json();
			this.cache.set(url, data);
			return data;
		} catch (error) {
			console.error('Geocoding fetch failed:', error);
			return null;
		}
	}

	async search(query: string): Promise<any> {
		const encodedQuery = encodeURIComponent(query);
		const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1&accept-language=en`;
		return this.fetchWithThrottle(url);
	}

	async reverseGeocode(lng: number, lat: number): Promise<LocationContext | null> {
		const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&extratags=1&accept-language=en`;
		const data = await this.fetchWithThrottle(url);

		if (!data || data.error === 'Unable to geocode') return null;

		const isWater = data.type === 'sea' || data.type === 'ocean' || data.type === 'water';
		if (isWater) return null;

		// Fetch timezone from BigDataCloud
		const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
		const bdcData = await this.fetchWithThrottle(bdcUrl);
		const timezone = bdcData?.localityInfo?.informative?.find((i: any) => i.description === 'time zone')?.name || 'UTC';

		return {
			lng: data.lon ? parseFloat(data.lon) : lng,
			lat: data.lat ? parseFloat(data.lat) : lat,
			city: data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || data.name || 'Unknown Location',
			state: data.address?.state || data.address?.region || data.address?.county || '',
			country: data.address?.country || '',
			population: data.extratags?.population || 'N/A',
			timezone
		};
	}

	async fetchCities(searchQuery: string, countryCode: string | null): Promise<LocationContext[]> {
		let data = [];
		
		if (countryCode) {
			const url = `https://nominatim.openstreetmap.org/search?countrycodes=${countryCode}&featuretype=city&format=json&limit=15&addressdetails=1&extratags=1&accept-language=en`;
			data = await this.fetchWithThrottle(url) || [];
		}
		
		if (data.length === 0) {
			const query = encodeURIComponent(`city ${searchQuery}`);
			const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=15&addressdetails=1&extratags=1&accept-language=en`;
			data = await this.fetchWithThrottle(url) || [];
		}
		
		if (data.length === 0) return [];

		// For each city, we'll need to resolve timezone. 
		// Since this is a batch, we'll map them but timezone will be fetched on demand or we can batch it if needed.
		// For simplicity, we'll add a placeholder or fetch it during the wandering sequence.
		return data.map((d: any) => ({
			lng: parseFloat(d.lon),
			lat: parseFloat(d.lat),
			city: d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || d.name || 'Unknown Location',
			state: d.address?.state || d.address?.region || d.address?.county || '',
			country: d.address?.country || '',
			population: d.extratags?.population || 'N/A'
		}));
	}
}

export const geocodingService = new GeocodingService();
