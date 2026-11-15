import { isScopeWaveform } from "./icom-scope";

export type PeeledCiv = {
  forward: Uint8Array;
  scopes: Uint8Array[];
  rest: Uint8Array;
};

/**
 * Tira os quadros 27 00 de um fluxo CI-V e devolve o resto na mesma ordem.
 * Um FE FE sem FD fica no resto, para o próximo pedaço fechar o quadro.
 */
export function peelCivScope(input: Uint8Array): PeeledCiv {
  const forward: number[] = [];
  const scopes: Uint8Array[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] !== 0xfe) {
      forward.push(input[i]!);
      i += 1;
      continue;
    }
    if (i + 1 >= input.length) break;
    if (input[i + 1] !== 0xfe) {
      forward.push(input[i]!);
      i += 1;
      continue;
    }
    let end = -1;
    for (let j = i + 2; j < input.length; j += 1) {
      if (input[j] === 0xfd) {
        end = j;
        break;
      }
    }
    if (end < 0) break;
    const frame = input.subarray(i, end + 1);
    if (isScopeWaveform(frame)) scopes.push(frame);
    else for (let k = i; k <= end; k += 1) forward.push(input[k]!);
    i = end + 1;
  }
  return { forward: Uint8Array.from(forward), scopes, rest: input.subarray(i) };
}
