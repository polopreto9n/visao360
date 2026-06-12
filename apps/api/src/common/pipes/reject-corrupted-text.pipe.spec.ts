import { BadRequestException } from '@nestjs/common';
import { RejectCorruptedTextPipe } from './reject-corrupted-text.pipe';

describe('RejectCorruptedTextPipe', () => {
  const pipe = new RejectCorruptedTextPipe();
  const metadata = { type: 'body' as const };

  it('preserves valid UTF-8 text in nested input', () => {
    const value = {
      name: 'Inspeção Mensal de Elevador',
      items: [{ question: 'Iluminação da cabine funciona?' }],
    };

    expect(pipe.transform(value, metadata)).toBe(value);
  });

  it('rejects text that already contains the Unicode replacement character', () => {
    expect(() => pipe.transform({ name: 'Inspe��o' }, metadata)).toThrow(BadRequestException);
  });

  it('does not iterate Buffer contents (uploaded file)', () => {
    const file = {
      fieldname: 'file',
      originalname: 'foto.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      size: 6,
    };

    expect(pipe.transform(file, metadata)).toBe(file);
  });
});
