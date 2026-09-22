import fs from 'node:fs/promises';
const target='dist';await fs.mkdir(target,{recursive:true});
for(const name of ['index.html','analysis.css','analysis-panel.js','analysis-engine.js','logos','data'])await fs.cp(name,`${target}/${name}`,{recursive:true});
await fs.writeFile(`${target}/.nojekyll`,'');console.log('Static site built in dist/.');
