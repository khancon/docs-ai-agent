"""Record the installed runtime dependency closure for reproducible containers."""
from importlib.metadata import distribution
from packaging.requirements import Requirement
from pathlib import Path
root=Path(__file__).resolve().parents[1]
pending=[Requirement(line).name for line in (root/'requirements.txt').read_text().splitlines() if line and not line.startswith('#')]
seen={}
while pending:
    name=pending.pop();dist=distribution(name);canonical=dist.metadata['Name']
    if canonical.lower() in seen:continue
    seen[canonical.lower()]=(canonical,dist.version)
    for raw in dist.requires or []:
        req=Requirement(raw)
        if req.marker is None or req.marker.evaluate({'extra':''}):pending.append(req.name)
(root/'requirements.lock').write_text('# Runtime dependency closure; Python 3.12. Regenerate after intentional dependency upgrades.\n'+'\n'.join(f'{n}=={v}' for n,v in sorted(seen.values(),key=lambda v:v[0].lower()))+'\n')
