// Imports exactly what the manifest declares, in both directions.
import { __assign } from 'tslib';
import { of } from 'rxjs';
import { readFileSync } from 'node:fs';
import { helper } from './helper.js';

export const version = String(__assign({}, { of, readFileSync, helper }));
