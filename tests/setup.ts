import { afterAll } from 'vitest';
import { closeTestDatabase } from './helpers';

afterAll(closeTestDatabase);
