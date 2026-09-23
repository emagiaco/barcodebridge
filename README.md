# BarcodeBridge

Una piccola app open source per trovare candidati EAN/UPC a partire da un nome prodotto, un ASIN, un URL Amazon o un barcode già noto. Mostra le fonti, verifica la cifra di controllo e rende il codice scansionabile dallo schermo.

## Avvio

Richiede Node.js 24+ e npm. Da questa cartella:

```bash
npm install
npm run build -w @barcodebridge/core
cp .env.example .env
# Inserisci la tua TAVILY_API_KEY in .env (GEMINI_API_KEY è facoltativa).
npm run dev
```

Apri http://localhost:5173. L'API gira su http://localhost:3001 e Vite inoltra `/api` durante lo sviluppo.
Il file `.env` va nella cartella principale del repository. Riavvia `npm run dev` dopo ogni modifica a `.env`. In alternativa inserisci la chiave Tavily nell'interfaccia sotto «Chiavi API personali»; dopo averla salvata, premi «Sblocca» con la tua frase per usarla in una nuova sessione. Una chiave Gemini da sola non permette di cercare un ASIN sul web.

Per la build: `npm run build`, poi `npm run start -w @barcodebridge/api` e servi `apps/web/dist` con un server statico che inoltri `/api` all'API. Per eseguire i test: `npm test` dopo la build del core.

## Ricerca per ASIN, URL Amazon o nome

BarcodeBridge estrae l'ASIN dal link Amazon e cerca sul web tramite Tavily. La ricerca `basic` costa un credito; Tavily dichiara 1.000 crediti gratuiti al mese per account. Una regola locale cerca EAN/UPC/GTIN espliciti nei risultati. Gemini 3.1 Flash-Lite viene chiamato **solo** se le regole trovano meno di due domini con un codice: estrae dati dai brevi testi delle fonti usando JSON strutturato. Il server accetta solo codici che compaiono testualmente nella fonte indicata e superano la cifra di controllo. Nessuna AI può convalidare da sola un'associazione tra prodotto e barcode.
Per gli ASIN, la prima query cerca soltanto l'ASIN: i termini generici sui barcode rischiano di far prevalere guide sui GTIN invece delle pagine prodotto. Tavily restituisce anche il testo delle pagine quando disponibile. Se l'anteprima non contiene un codice, BarcodeBridge richiede con Tavily Extract il contenuto di un massimo di cinque risultati pertinenti: privilegia rivenditori non Amazon con anteprime brevi, escludendo Amazon, social e Ubuy dall'estrazione aggiuntiva. Una pagina del rivenditore senza ASIN può produrre soltanto una corrispondenza indiretta per nome e formato. Tavily conteggia un credito ogni cinque pagine estratte con successo nella modalità basic. Se ancora non trova un codice verificabile, prova una seconda ricerca: quando almeno due fonti con l'ASIN indicano lo stesso codice modello, cerca quel modello con GTIN/UPC; altrimenti, se una pagina Amazon presenta marca, caratteristiche distintive e formato, cerca questi dettagli includendo il tipo di prodotto ed EAN. Il fallback per il siero usa termini italiani anche quando il segnale italiano appare in una pagina terza collegata all'ASIN, non soltanto in una scheda Amazon.it: Tavily preferisce comparatori italiani e il paese Italia. Le pagine pertinenti scoperte solo dalla seconda ricerca possono essere lette con un'ulteriore chiamata Extract. Se anche questa ricerca fallisce, prova `ASIN codice EAN` consumando un'altra ricerca. Un codice ottenuto tramite modello o nome compare con entrambe le fonti e affidabilità al massimo media: la variante va controllata. Per il nome la seconda fonte deve riportare la stessa marca, almeno due caratteristiche distintive e lo stesso formato; kit e confezioni multiple e pagine che dichiarano un altro ASIN sono escluse. La quota giornaliera condivisa riserva una chiamata per ogni ricerca o estrazione avviata. In caso di risultato vuoto, l'interfaccia mostra il numero di pagine ricevute e i codici verificati per aiutare a distinguere un problema di ricerca da una fonte senza prove sufficienti.
Se inserisci direttamente un EAN/UPC valido, BarcodeBridge lo rende scansionabile anche se nessun catalogo riconosce il prodotto: il checksum conferma il formato del numero, non l'identità dell'articolo. La diagnostica mostra gli indirizzi delle prime pagine senza parametri URL. Le chiavi API personali devono contenere solo i caratteri della chiave, senza spazi o simboli aggiunti.
In caso di errore o di risultato vuoto, «Esporta info» copia un report testuale negli appunti: input, orari, query Tavily, status HTTP, anteprime delle prime risposte e risultati delle fonti. Le chiavi API e gli header di autorizzazione non compaiono nel report. Ogni anteprima è limitata a 500 caratteri per mantenere il testo incollabile in una segnalazione.

Configura `TAVILY_API_KEY` nel backend per offrire ricerche condivise (massimo 25 ricerche al giorno, conteggiate in SQLite, più un limite per indirizzo IP). `GEMINI_API_KEY` è facoltativa: abilita l'estrazione AI solo quando serve. Entrambe possono essere sostituite dalle chiavi personali inserite nell'interfaccia. Non sono incluse chiavi nel repository: il gestore della propria installazione deve configurarle. Se è configurata `BARCODELOOKUP_API_KEY`, le ricerche per ASIN (anche da URL Amazon) interrogano prima Barcode Lookup: un codice valido evita le chiamate Tavily. Questa chiave è disponibile solo sul server. Senza Tavily, la ricerca generica per ASIN non è disponibile; resta la ricerca per nome su UPCitemdb, Open Food Facts e Open Beauty Facts e quella ASIN su Barcode Lookup se configurata la relativa chiave.

### Chiavi personali e cache

Le chiavi personali possono essere usate per una sola sessione o conservate **nel database IndexedDB del browser**, cifrate con AES-GCM e una frase scelta dall'utente. La frase non viene inviata al server. Le chiavi decifrate vengono inviate al backend soltanto per eseguire la ricerca e non sono salvate nel suo database. Usa HTTPS quando l'app non gira su localhost. Non salvare le chiavi in un browser condiviso se non hai il controllo del dispositivo.
Se accedi al server tramite un indirizzo IP in HTTP (per esempio `http://192.168.x.x:5173`), il browser non rende disponibile Web Crypto: puoi inserire le chiavi e cercare senza premere «Salva qui», ma evita di inviare chiavi tramite HTTP su reti non fidate. Per salvarle cifrate, apri `http://localhost:5173` sullo stesso computer oppure configura HTTPS.

Il backend usa un piccolo database SQLite (`BARCODEBRIDGE_DB_PATH`, predefinito `./data/barcodebridge.sqlite`) per memorizzare **solo i risultati positivi**, senza chiavi, per sette giorni. Ripetere una ricerca già riuscita non consuma una nuova chiamata web. I limiti e le quote dei fornitori possono cambiare: verifica il piano associato alle tue chiavi.

**Nota sui prezzi Google:** il tier API gratuito di Gemini Flash-Lite copre l'estrazione testuale, ma il Grounding con Google Search nell'API non fa parte di quel tier. La quota di ricerche Grounding indicata da Google si applica al piano a pagamento. Per questo la ricerca web avviene tramite Tavily e Gemini non usa Grounding.

**Confidenza:** è una regola euristica leggibile, non una probabilità calibrata. Il checksum indica soltanto che il numero è formalmente valido; non stabilisce che appartenga al prodotto. Confronta sempre variante e confezione. Un barcode leggibile non garantisce che Yuka abbia il prodotto nel proprio catalogo.

## Struttura

- `apps/web`: React, Vite, TypeScript, JsBarcode
- `apps/api`: Fastify e adapter verso le fonti
- `packages/core`: interpretazione input, checksum, aggregazione, punteggio

## Contributi

MIT. Le fonti e i relativi termini d'uso restano indipendenti da questa licenza. Per nuove fonti, restituisci candidati con URL verificabile e limita timeout e numero dei risultati. Per ampliare l'archivio di coppie verificate, aggiungi solo prodotti con fonti pubbliche che mostrano esplicitamente entrambi gli identificatori.
