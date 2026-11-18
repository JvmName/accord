import { z } from 'zod';
import { envelope } from '../../src/contract/envelope';

/** A success envelope around an empty object, for test routes that need some response schema. */
export const emptyResponse = envelope(z.strictObject({}));
