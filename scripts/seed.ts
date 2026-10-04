import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type Local = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

const root = process.cwd();
const keyPath = resolve(root, "serviceAccountKey.json");
const dataPath = resolve(root, "data", "locais.json");

function readKey(): string {
  try {
    return readFileSync(keyPath, "utf8");
  } catch {
    console.error("Arquivo serviceAccountKey.json não encontrado na raiz do projeto.");
    console.error("Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada.");
    console.error("Salve o download como serviceAccountKey.json (já está no .gitignore).");
    process.exit(1);
  }
}

async function main() {
  const serviceAccount = JSON.parse(readKey()) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    console.error("serviceAccountKey.json não parece uma chave de conta de serviço do Firebase.");
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
    });
  }

  const locais = JSON.parse(readFileSync(dataPath, "utf8")) as Local[];
  const db = getFirestore();
  const chunkSize = 400;
  let written = 0;

  for (let index = 0; index < locais.length; index += chunkSize) {
    const slice = locais.slice(index, index + chunkSize);
    const batch = db.batch();

    for (const local of slice) {
      if (!local.id || !Number.isFinite(local.lat) || !Number.isFinite(local.lng)) {
        throw new Error(`Local inválido no JSON: ${local.id || local.name}`);
      }
      const ref = db.collection("stations").doc(local.id);
      batch.set(
        ref,
        {
          name: local.name,
          lat: local.lat,
          lng: local.lng,
        },
        { merge: true },
      );
    }

    await batch.commit();
    written += slice.length;
    console.log(`Gravados ${written}/${locais.length}`);
  }

  console.log("Seed concluído. Seções ficam no JSON do cliente. O campo reports não foi alterado.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
