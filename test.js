const axios = require('axios');

async function fetchLatLongFromGoogleMapsUrl(shortUrl) {
    try {
        // Step 1: Expand the short URL
        const response = await axios.get(shortUrl, {
            maxRedirects: 0, // Prevent auto-following redirects
            validateStatus: (status) => status >= 300 && status < 400, // Only redirects are valid
        });

        const expandedUrl = response.headers.location;
        if (!expandedUrl) {
            throw new Error('Failed to expand the URL.');
        }

        // Step 2: Extract coordinates from the URL's query parameters
        const queryString = expandedUrl.split('?')[0];
        const queryString1 = expandedUrl.split('search/')[1];
        const queryParams1 = new URLSearchParams(queryString1);

        console.log(queryParams1);
        const latitude = queryString1.split(',')[0];
        const longitude = queryString1.split('+')[1];

        if (latitude && longitude) {
            return { latitude, longitude };
        } else {
            console.log('Latitude and longitude not found in the URL.');
            return null;
        }
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        return null;
    }
}

// Example usage
(async () => {
    const shortUrl = 'https://maps.app.goo.gl/nm1hBx5LPkj9r1Xm9'; // Short URL
    const result = await fetchLatLongFromGoogleMapsUrl(shortUrl);

    if (result) {
        console.log('Latitude:', result.latitude);
        console.log('Longitude:', result.longitude);
    } else {
        console.log('Failed to fetch coordinates.');
    }
})();