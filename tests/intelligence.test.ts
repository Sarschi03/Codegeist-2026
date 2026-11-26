import { describe, expect, it } from 'vitest';
import { analyze, generateTasks, rankSources } from '../src/shared/intelligence';
import { emptyScene, validateWorkspace, type Scene, type Source } from '../src/shared/model';
const source:Source={id:'PAY-156',product:'Jira',title:'Improve mobile payment button',description:'The payment button falls below the fold on mobile.',status:'To do',related:['guidelines'],retrievedAt:1};
const doc:Source={id:'guidelines',product:'Confluence',title:'Accessibility review',description:'Tap targets and focus indicators.',status:'Reference',related:[],retrievedAt:1};
const rect=(id:string,type:Scene['elements'][number]['type'])=>({id,type,x:0,y:0,width:2,height:2,version:1,isDeleted:false});
describe('Context Magnet',()=>{
  it('prioritizes issue keys and identifies possible duplicate work',()=>{
    const results=rankSources('PAY-156 payment button on mobile',[doc,source]);
    expect(results[0]).toMatchObject({source,duplicate:true});
    expect(results.find((item)=>item.source.id==='guidelines')?.why).toContain('PAY-156');
  });
  it('preserves reported evidence without inventing reproduction steps',()=>{
    const scene={...emptyScene(),annotations:[{id:crypto.randomUUID(),elementId:'pin',number:1,note:'Payment button falls below the fold on mobile.',extractedText:'Continue to payment',resolved:false}],elements:[rect('pin','ellipse')]};
    const result=generateTasks(analyze(scene,['pin']),[source]);
    expect(result[0]).toMatchObject({issueType:'Bug',elementIds:['pin'],evidence:[source]});
    expect(result[0].missing).toMatch(/reproduction steps/);
    expect(result[0].description).toContain('Continue to payment');
  });
  it('reads bound arrows as explicit dependencies',()=>{
    const scene={...emptyScene(),elements:[rect('cart','rectangle'),rect('pay','rectangle'),{...rect('a','text'),text:'Cart',containerId:'cart'},{...rect('b','text'),text:'Payment',containerId:'pay'},{...rect('arrow','arrow'),startBinding:{elementId:'cart'},endBinding:{elementId:'pay'}}]};
    const result=generateTasks(analyze(scene,['cart','pay']),[]);
    expect(result.find((item)=>item.title==='Implement Payment')?.description).toContain('Canvas dependencies: Cart');
  });
  it('drops embedded scenes and rejects external file URLs',()=>{
    const board={id:crypto.randomUUID(),schemaVersion:1,name:'Test',description:'',template:'Blank canvas',favorite:false,createdAt:1,updatedAt:1,revision:0};
    expect(validateWorkspace({...board,scene:{...emptyScene(),elements:[rect('embed','iframe')]}}).scene.elements).toEqual([]);
    expect(()=>validateWorkspace({...board,scene:{...emptyScene(),files:{abc:{id:'abc',mimeType:'image/png',dataURL:'https://example.com/test.png',created:1}}}})).toThrow();
  });
});
