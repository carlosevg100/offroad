# Revalidação independente de F6

Agente Codex `/root/stage15_independent_review`, revisão por IA. Sujeito fixado `45813bf20bd982acda642972d48bf96b728d034e`. **F6 corrigido; aceite global permanece negado por F5.** Nenhuma aprovação humana ou publicação.

Meu verificador compilou o compilador desse commit com um leitor virtual de arquivos proveniente exclusivamente dos blobs Git fixados. Não modifiquei o checkout. Conferi SHA256 dos cinco testes declarados na fonte canônica e sua presença na closure do executor: cinco conferem.

Mudei, somente em memória, os bytes de cada um desses cinco testes, um por vez. Em todas as cinco mutações, o manifesto e o hash do executor mudaram e o hash da fonte profissional permaneceu igual. Portanto o teste participa efetivamente da identidade; não é apenas um caminho listado.

Comparei os três arquivos de `knowledge/releases` com o commit anterior: bytes idênticos. O próprio compilador congelado também validou o lock e seus snapshots ao executar as seis compilações. Nenhum método publicado recebeu identidade nova por esta correção.

Evidências independentes: `revalidate-f6.mjs`, `REVALIDACAO-F6.json` e `.log`. O JSON fixa commit, hash da fonte/manifesto, cada teste/hash e cada mutação. Os pareceres anteriores não foram alterados. A revisão do rascunho de eventos é outro sujeito, não incluído neste aceite limitado.
