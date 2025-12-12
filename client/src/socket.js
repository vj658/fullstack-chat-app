import { io } from 'socket.io-client';

// This pulls the IP address from your .env file
const URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const socket = io(URL, {
    transports: ['websocket'], // Helps with mobile connections
    autoConnect: true
});