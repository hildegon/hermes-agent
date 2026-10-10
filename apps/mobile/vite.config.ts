import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ base: './', plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, server: { port: 5180, fs: { allow: ['../..'] } }, build: { target: 'es2022' } })
