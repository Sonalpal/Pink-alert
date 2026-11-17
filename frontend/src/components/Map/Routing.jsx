import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

export default function Routing({ from, to }) {
    const map = useMap();

    useEffect(() => {
        if (!from || !to) return;

        const control = L.Routing.control({
            waypoints: [L.latLng(from[0], from[1]), L.latLng(to.lat, to.lon)],
            router: L.Routing.osrmv1({
                serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
                profile: 'driving', // correct: this walking server uses the name "driving"
            }),
            addWaypoints: false,
            draggableWaypoints: false,
            routeWhileDragging: false,
            fitSelectedRoutes: true,
            show: false,                 // directions list stays collapsed in the small dashboard map
            collapsible: true,
            createMarker: () => null,    // you already show your own markers
            lineOptions: { styles: [{ color: '#8B4A6A', weight: 6 }] },
        }).addTo(map);

        return () => {
            try { map.removeControl(control); } catch (e) {}
        };
    }, [from, to, map]);

    return null;
}