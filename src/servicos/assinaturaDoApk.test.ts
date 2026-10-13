/**
 * A CHAVE QUE ASSINA O APK (14/10/2026).
 *
 * Até o 1.2 o APK saía com a chave de depuração automática de um
 * computador só — perdida ela, nenhum APK futuro atualizaria o que está
 * instalado, e o QR deixaria de abrir o app. Desde o 1.3, a chave do
 * CONECTA (~/ConectaChave, com cópia fora da máquina).
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const CHAVE_DO_CONECTA = 'E7:52:A7:87:0F:A1:5D:22:44:6B:68:5E:1A:24:30:9E:F6:3D:B1:D8:C8:3C:D3:E8:A4:91:57:32:89:09:19:3F';
const CHAVE_DO_1_2 = 'EA:4F:22:E6:25:61:DF:D7:F9:7F:2A:06:75:0B:B8:E9:F1:48:64:BE:47:D7:CC:4F:2B:80:90:B3:BF:5A:A8:83';

test('o QR abre o app assinado pela chave do CONECTA — e o 1.2 ainda instalado, na transição', () => {
  const links = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  const impressoes = links.flatMap((l: any) => l.target?.sha256_cert_fingerprints || []);
  expect(impressoes).toContain(CHAVE_DO_CONECTA);
  expect(impressoes).toContain(CHAVE_DO_1_2);
});

test('o APK de produção é assinado pela chave do CONECTA, e sem ela o build PARA', () => {
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  expect(gradle).toContain('signingConfig signingConfigs.release');
  expect(gradle).toContain("rootProject.file('assinatura.properties')");
  expect(gradle).toContain('throw new GradleException(');
});

test('a chave e a senha nunca entram no repositório', () => {
  const ignorados = readFileSync('.gitignore', 'utf8');
  expect(ignorados).toContain('*.jks');
  expect(ignorados).toContain('*.keystore');
  expect(ignorados).toContain('android/assinatura.properties');
});
