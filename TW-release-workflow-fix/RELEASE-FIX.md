# npm publish fix (tw-framework 2.0.0)

## Kya galat tha

`create-tw-framework@2.0.0` npm par chala gaya, par `tw-framework@2.0.0` nahi
gaya — aur workflow phir bhi "success" dikha. Wajah: publish step
`npm publish || echo "::warning::… already published - skip"` tha, isliye
asli fail chhup gaya.

## Ab kya badla

- Publish ab idempotent hai par **imaandaar**: `npm view` se check hota hai ki
  version npm par hai ya nahi. Hai to skip; nahi hai to publish — aur publish
  fail ho to **job fail** hoti hai (error dikhta hai).
- `workflow_dispatch` juda: tag dobara banane ki zarurat nahi — kisi bhi tag
  ke liye workflow haath se chala sakte ho.
- Release ke saath `tw-framework-<ver>.tgz` aur `SHA256SUMS` assets bhi
  attach hote hain.

## Chalane ka tarika

```sh
cd ~/tw-framework && git checkout main && git pull

unzip -o /storage/emulated/0/Download/TW-release-workflow-fix-pack.zip
cp -r TW-release-workflow-fix/files/.github .
git add .github && git commit -m "ci: honest, idempotent, re-runnable release" && git push
```

Phir: GitHub → Actions → **Release** → **Run workflow** → tag `v2.0.0` →
Run. Job typecheck + test karegi, bundle banayegi, aur agar 2.0.0 npm par nahi
hai to publish karegi.

Check: <https://www.npmjs.com/package/tw-framework> par `2.0.0` dikhna chahiye.
