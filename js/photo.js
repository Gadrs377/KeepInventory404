// Foto da embalagem: reduz para no máximo 1024 px e vira JPEG, para caber no
// limite do repassador (1 MB) e subir rápido no 4G.

export async function photoToDataUrl(file, max = 1024) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não deu para abrir a foto. Tente outra.')); };
      img.src = url;
    });
  }
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

// Miniatura quadrada do meio da foto (240 px), para virar a foto do produto
// quando os dados vêm da própria foto. Fica em torno de 10 KB.
export async function photoThumb(file, size = 240) {
  const source = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!source) return '';
  const side = Math.min(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, size, size);
  if (source.close) source.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

// "400g" -> "400 g", "1,5L" -> "1,5 l": igual ao tamanho que vem das lojas.
function tidySize(s) {
  const m = String(s || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|mg|ml|l|un|unidades?)$/i);
  return m ? `${m[1]} ${m[2].toLowerCase()}` : String(s || '').trim();
}
// Marca em caixa alta vira só a inicial maiúscula ("NESCAU" -> "Nescau");
// siglas curtas ficam como estão ("OMO", "YPÊ").
function tidyBrand(s) {
  const b = String(s || '').trim();
  if (b.length <= 3 || b !== b.toLocaleUpperCase('pt-BR')) return b;
  return b.toLocaleLowerCase('pt-BR').replace(/(^|\s)\p{L}/gu, (c) => c.toLocaleUpperCase('pt-BR'));
}

/**
 * O que a IA leu na embalagem, no formato de um produto: nome como nas lojas
 * (tipo, marca, variante, tamanho), marca e tamanho separados e a miniatura da
 * foto. Null quando a foto não disse nem o tipo nem a marca.
 */
export function photoProduct(read, image = '') {
  if (!read) return null;
  const brand = tidyBrand(read.brand);
  const kind = String(read.product || '').trim();
  if (!kind && !brand) return null;
  const has = (s) => s && kind.toLocaleLowerCase('pt-BR').includes(s.toLocaleLowerCase('pt-BR'));
  const parts = [kind, has(brand) ? '' : brand, has(read.variant) ? '' : read.variant, read.size].map((s) => String(s || '').trim()).filter(Boolean);
  const name = parts.join(' ');
  return {
    name: name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1),
    brand,
    size: tidySize(read.size),
    image,
    source: 'foto',
  };
}
