self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share') return;
    event.respondWith((async () => {
        const destination = new URL('./', self.registration.scope);
        destination.searchParams.set('action', 'import');
        try {
            const data = await event.request.formData();
            const file = data.get('route');
            if (file instanceof File && file.size <= 20 * 1024 * 1024 && /\.(gpx|kml|geojson|json)$/i.test(file.name)) {
                const cache = await caches.open('trailnav-shared-routes');
                const id = crypto.randomUUID();
                const key = new URL(`__shared_route/${id}`, self.registration.scope);
                await cache.put(key, new Response(file, { headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' } }));
                destination.searchParams.set('shared', id);
            } else if (data.get('url') || data.get('text')) {
                destination.searchParams.set('url', String(data.get('url') || data.get('text')));
            } else { destination.searchParams.set('shareError', '1'); }
        } catch { destination.searchParams.set('shareError', '1'); }
        return Response.redirect(destination.href, 303);
    })());
});