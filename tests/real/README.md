# Material real de teste

Fotos e vídeos de embalagens de verdade, usados para medir o leitor de
validade (`tests/real-video.mjs`, `tests/photos.mjs` e companhia). Ficam no
repositório para que qualquer mudança no leitor possa ser medida contra eles —
antes ficavam só em `tests/private/`, que some junto com o computador onde o
teste rodou.

**Tudo aqui é público**: o repositório é aberto no GitHub e qualquer pessoa
baixa os arquivos (o site do GitHub Pages só publica as pastas do app, mas isso
não protege o repositório). Por isso cada arquivo entra recortado e sem metadados. O vídeo original da lata trazia a
coordenada GPS de onde foi gravado (precisão de ~15 m), o modelo do celular e a
hora — nada disso pode entrar. `tests/private/` continua existindo, fora do Git,
para o que não deve ficar público.

`manifest.json` lista cada arquivo com a data de referência (lida a olho) e a
região onde a data aparece.

## Como adicionar

Vídeo: recorta só a embalagem, tira áudio e metadados, VP9 (o Chromium dos
testes não toca H.264/HEVC).

    ffmpeg -i ORIGINAL.mov -map 0:v:0 -map_metadata -1 -map_chapters -1 -an \
      -vf "crop=LARGURA:ALTURA:X:Y" -c:v libvpx-vp9 -crf 32 -b:v 0 tests/real/NOME.webm

Foto: aplica a rotação do EXIF antes de apagá-lo (senão a foto fica deitada e
as regiões do manifesto deixam de bater), e salva sem EXIF nenhum:

    python3 -c "from PIL import Image, ImageOps; ImageOps.exif_transpose(Image.open('ORIGINAL.jpeg')).convert('RGB').save('tests/real/NOME.jpeg', quality=95)"

Conferir antes de commitar — não pode aparecer localização, aparelho nem data:

    ffprobe -v error -show_entries format_tags:stream_tags tests/real/NOME.webm
    python3 -c "from PIL import Image; print(dict(Image.open('tests/real/NOME.jpeg').getexif()))"

Olhar também a imagem em si: nada de casa, rosto, documento ou tela aparecendo
em volta da embalagem.

As seis fotos do teste de 27/09/2026 (`tests/photos-baseline.json`) ainda não
estão aqui: precisam ser enviadas de novo e passar pelo passo acima, com os
mesmos nomes. Os scripts já procuram em `tests/real/` e em `tests/private/`
(`tests/media.mjs`).

## Rodar

Com o servidor na porta 8765 (ver `docs/LEITURA_VALIDADE.md`):

    node tests/real-video.mjs

Leva uns 4 minutos por vídeo (o Paddle medium lê ~4 s por quadro). Resultado em
`tests/real-video-results.json`. A única regra que reprova é confirmar sozinho
uma data diferente da referência; o resto é medida.

## O que só dá para testar num iPhone de verdade

Os testes aqui rodam no Chromium. No Safari/iPhone ainda falta conferir:

1. **Memória**: com Tesseract, Paddle small e Paddle medium carregados juntos,
   a aba não recarrega sozinha (o Safari mata a aba sem avisar quando passa do
   limite). Deixar a câmera tentando uma embalagem difícil por 1–2 minutos.
2. **Câmera do celular**: "Tirar foto com a câmera do celular" abre a câmera
   do iOS; ao voltar, a câmera da página volta a mostrar imagem e a ler.
3. **Tempo do download** do Paddle medium (139 MB) no wi-fi de casa, e se ele
   continua em cache no dia seguinte (abrir de novo sem internet).
4. **Mensagens de causa**: com pouca luz aparece "Está escuro…"; com reflexo na
   lata, "Tem reflexo…"; mexendo a mão, "Segure parado…" — e que não ficam
   piscando.
5. **Piscar da foto automática** visível, e o toque para ampliar a foto na
   página de digitar.
