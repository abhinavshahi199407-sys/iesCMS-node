import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // The iesCMS repo root carries its own package-lock.json, so Next would
    // otherwise infer the workspace root one level too high.
    turbopack: {
        root: dirname(fileURLToPath(import.meta.url)),
    },
};

export default nextConfig;
