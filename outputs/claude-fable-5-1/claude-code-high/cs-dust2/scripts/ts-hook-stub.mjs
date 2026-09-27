// Like ts-hook.mjs but replaces the 'three' package with a permissive stub.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(pathToFileURL('./scripts/ts-resolver.mjs'), { data: { stubThree: true } });
