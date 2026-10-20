// Exporta o mapa "nome FMA normalizado → id da ficha" para o script Python.
import { FMA_TO_ID } from '../src/data/catalog.js';
process.stdout.write(JSON.stringify(Object.fromEntries(FMA_TO_ID)));
