# Testes das seis embalagens — 27/09/2026

O fluxo atualizado reconheceu corretamente cinco das seis fotos, sem confirmar
nenhuma data errada neste ensaio. A embalagem roxa em relevo ficou sem resultado.
Isso não é uma estimativa de precisão geral nem uma medição no celular.

## Resultado no fluxo completo

| Foto, na ordem recebida | Validade de referência visual | Resultado automático | Tempo no ambiente de teste |
|---|---|---|---|
| Branca, Val/Fab escritos à esquerda | 05/2028 | 05/2028 | 1,7 s |
| Vermelha | 02/2027 | 02/2027 | 10,2 s |
| Azul, letras douradas | 04/2028 | 04/2028 | 1,7 s |
| Roxa, gravação em relevo | 07/2028 | Sem confirmação | encerrado aos 30 s |
| Branca Prati, tinta escura | 03/2028 | 03/2028 | 1,4 s |
| Branca, gravação em relevo | 06/2027 | 06/2027 | 14,6 s |

As seis embalagens informam mês/ano. A data interna usa o fim do mês, conforme
a regra já existente do aplicativo; esse dia não foi lido na embalagem.

## Como foi testado

- Chromium com Tesseract.js e o worker Paddle reais, gratuitos e locais.
- **330 chamadas comparativas aos motores**: 180 de referência (dez configurações
  Tesseract e cinco filtros Paddle, em foto inteira e região enquadrada, para cada
  foto); mais 90 de Tesseract sobre regiões detectadas pelo Paddle e 60 para canais
  de cor/contraste nos dois motores.
- Nenhuma resposta esperada foi fornecida ao OCR. As datas de referência só são
  usadas na avaliação posterior. A referência da foto roxa é visual e deve ser
  conferida na embalagem original.
- A região enquadrada foi marcada manualmente, simulando a pessoa posicionando
  a validade na mira. Não deve ser contada como localização automática. As
  coordenadas estão em `tests/photos.mjs`.
- As regiões do experimento Paddle → Tesseract vieram de polígonos detectados,
  sem marcação manual da linha de validade. Eles foram mapeados de volta à imagem
  original para conservar resolução.
- O fluxo completo usou `canvas.captureStream`, reapresentando a foto enquadrada.
  Exercita tentativas, fallback, alternância, votos, confirmação, captura de
  evidência e encerramento da câmera; não representa frames independentes de uma
  câmera real, tremor, foco, luz variável, bateria ou Safari/iPhone.
- Os tempos incluem inicialização local, não um download inicial representativo
  no telefone. Podem ser bastante diferentes em outro dispositivo.

## O que foi encontrado e aplicado

1. **Interpretação de mês/ano:** `V02 27`, `V0227` e `VO4 28` estavam sendo
   descartados, mesmo quando o motor havia lido quase tudo corretamente.
   O interpretador agora aceita esses formatos sob rótulo explícito de validade,
   com correção O→0 restrita ao início da data após V/F. Não junta linhas arbitrárias.
2. **Posição dos blocos:** na caixa azul o Paddle às vezes devolvia `28` antes
   de `V04`. Ordenar blocos da mesma linha pela posição recuperou `V04 28`.
   Mantém linhas de fabricação e validade separadas.
3. **Canais vermelho/azul:** permitiram ao Paddle reconhecer `V 06/27` no relevo
   branco. Foram adicionados ao fallback, com ajuste de contraste pelos percentis
   1 e 99, mantendo o mesmo motor local e sem downloads adicionais.
4. **Proteção contra fabricação:** no relevo branco, o motor às vezes lia
   `06/25` e perdia o F. Repetir esse resultado poderia confirmar fabricação.
   Datas sem rótulo agora exigem escolha manual, mesmo com confiança alta.
   Nenhum limiar foi reduzido para fazer as fotos passarem.
5. **Imagem na confirmação:** o recorte original aparece junto da data antes de
   salvar, com explicação para mês/ano. O teste da interface verificou imagem,
   largura de celular, legenda e salvamento. O scanner foi substituído por um
   resultado controlado apenas nesse teste de interface; os testes de OCR são separados.

## Todas as ideias propostas

| Possibilidade | Teste e conclusão | Situação |
|---|---|---|
| Escolher quadros mais nítidos | Variância do Laplaciano escolheu a imagem sem desfoque nas 6 sequências, cada uma com 4 níveis de desfoque artificial. Isso não comprova melhoria com reflexos ou ruído. Numa tentativa anterior (fora deste pacote), **deixar só os quadros mais nítidos na fila piorou o resultado** — provavelmente porque descartava quadros em vez de só priorizá-los, perdendo leituras que ainda tinham informação útil mesmo sem ser o quadro mais nítido. | Não tentar de novo como filtro. Se reconsiderar, usar a nitidez só para ordenar/pesar votos, nunca para pular a leitura de um quadro |
| Relacionar texto pela posição | Reunião de blocos separados corrigiu mês/ano das caixas coloridas; testes negativos impedem união de linhas diferentes. | Aplicado ao Paddle |
| Detectar troca de embalagem | Miniatura RGB e limiar de diferença 0,15 detectaram 12 de 15 pares. Falharam os três pares entre caixas brancas. Pequeno deslocamento simulado não disparou troca nos 6 casos. | Não ativado; falha justamente em embalagens parecidas |
| Paddle localizar, Tesseract reler | 90 leituras; melhorou confiança em algumas linhas. Ex.: caixa vermelha chegou a 88/100 com cinza/Otsu. Não resolveu os relevos nem acrescentou uma foto resolvida frente aos outros ajustes. Recorte sem rótulo também recuperou fabricação e até datas erradas. | Não ativado automaticamente; falta preservar/verificar associação com o rótulo |
| Mostrar recorte junto da data | Imagem decodificada nas cinco confirmações reais; teste separado verificou interface e salvamento. | Aplicado |
| Priorizar configuração anterior | Replay das saídas reais de Tesseract: 27 tentativas com ordem fixa, 26 com a última configuração bem-sucedida primeiro, limitando a dez nos casos sem leitura. | Ganho pequeno nesta amostra; não ativado |

Também foram testados Otsu, Otsu local, Sauvola, cinza, rotações ±4°, três modos
de segmentação, escala/desfoque, canais RGB, expansão global de contraste e
contraste local. Mais filtros não significaram mais acertos: alguns destruíram
detalhes que o original preservava.

## O que ainda falhou

A gravação roxa não gerou validade confiável em nenhum dos testes comparativos.
Ela tem relevo, reflexo e baixo contraste. A próxima experiência útil é capturar
novamente com luz lateral, mudando levemente o ângulo e evitando o reflexo sobre
os números, e enviar um vídeo curto para avaliar foco e escolha de quadros.
Não há evidência para prometer que outro filtro recuperará essa foto específica.

## Reproduzir e auditar

As fotos originais não entram no repositório/pacote. Coloque-as em
`tests/private/` com os nomes originais, listados nos JSONs de resultado.
Essa pasta é ignorada pelo Git. Dependências e servidor: veja
`LEITURA_VALIDADE.md`.

Com o servidor na porta 8765:

```sh
node --test tests/expiry.test.mjs tests/layout.test.mjs
node tests/photos.mjs
node tests/photo-experiments.mjs
node tests/camera-heuristics.mjs
node tests/photo-camera.mjs
node tests/evidence-ui.mjs
node tests/ocr-browser.mjs
node tests/ocr-lifecycle.mjs
```

- `photos-baseline.json`: saídas colhidas antes das correções desta rodada,
  sobre o código de `a7f1361`. Fica preservado; novas execuções de `photos.mjs`
  gravam `photos-current.json` por padrão.
- `photos-experiments.json`: reinterpretação dessas saídas e leituras adicionais.
- `camera-heuristics-results.json`: desfoque, deslocamento, troca de caixa e ordem.
- `photo-camera-results.json`: fluxo completo da versão corrigida, incluindo
  encerramento de todas as trilhas e captura para confirmação.
- Nove testes de regras/layout passaram. Os controles anteriores também passaram:
  15/16 validades sintéticas confirmadas, quatro negativos rejeitados, fallback,
  falha de download, cancelamento e Paddle offline após cache.

Todas as alterações são locais, sem API paga. A publicação no GitHub ainda
depende de acesso de escrita; este pacote não altera sozinho o aplicativo publicado.
