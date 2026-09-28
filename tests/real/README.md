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

## Gravar um vídeo novo pelo próprio app

Os vídeos de hoje foram gravados com a câmera do celular, fora do app, e a
região do manifesto foi escolhida depois, olhando o vídeo — por isso não
servem para medir nada que dependa de onde a pessoa mira (ver "Oitavo
teste" em `docs/TESTES_VALIDADES_REAIS.md`). Para isso:

1. No app, **Mais → Diagnóstico da leitura de validade** ligado.
2. Ligar a **gravação de tela** do iPhone (Central de Controle).
3. Abrir a validade de um produto e mirar a data como faria normalmente, por
   uns 30–60 s, sem ajudar a câmera mais do que o normal.
4. Antes de fechar, tocar em **Copiar diagnóstico** e colar numa mensagem
   ou nota: é o JSON com cada leitura e o motivo da recusa.
5. Parar a gravação. Anotar a validade real, lida a olho.

A gravação de tela mostra exatamente o que a pessoa viu (mira, datas,
pergunta, avisos); o JSON diz o que o leitor viu. Antes de entrar aqui,
os dois passam pelo mesmo cuidado de cima: recortar a gravação só na área
da câmera (sem barra de status, notificações ou outros apps), sem áudio e
sem metadados, e conferir que o JSON não tem nada além de texto da
embalagem (ele traz o modelo do navegador em `ua`; apagar esse campo).

## Rodar

Com o servidor na porta 8765 (ver `docs/LEITURA_VALIDADE.md`):

    node tests/real-video.mjs

Leva uns 4 minutos por vídeo (o Paddle medium lê ~4 s por quadro);
`--flow` pula a medida das camadas e roda só o fluxo (90 s por vídeo), e
`--only=copo` roda um vídeo só. Resultado em `tests/real-video-results.json`.
A única regra que reprova é confirmar sozinho uma data diferente da
referência; o resto é medida — sobretudo **quando a data certa apareceu na
tela** (botão, pergunta ou confirmação), as datas erradas que apareceram
antes e por que a votação recusou cada leitura certa.

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
6. **Pergunta "É esta data?"**: aparece sem empurrar a câmera para fora da
   tela; "Sim" e "Não" cabem numa linha; o VoiceOver lê a pergunta uma vez.
7. **Digitar já preenchido**: a data vem selecionada e o primeiro número
   digitado troca tudo (no iOS a seleção feita por código às vezes não
   aparece; se não trocar, anotar).
8. **Copiar diagnóstico** funciona no Safari (senão, baixa o arquivo JSON).
