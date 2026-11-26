import type { BinaryFileData } from '@excalidraw/excalidraw/types';
import { checkoutImageId, makeCheckoutCapture } from './checkoutCapture';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { emptyScene, type Scene, type Source, type Template, type Workspace } from '../shared/model';

const created = Date.UTC(2026, 10, 1);
export const demoSources: Source[] = [
  { id:'PAY-142', product:'Jira', title:'Simplify checkout form', description:'Remove redundant billing fields and document guest checkout validation.', status:'In progress', related:['checkout-guidelines'], retrievedAt:created },
  { id:'PAY-156', product:'Jira', title:'Improve mobile payment button', description:'The checkout payment button falls below the fold on mobile. Improve visibility and touch target.', status:'To do', related:['PAY-142','mobile-accessibility'], retrievedAt:created },
  { id:'AUTH-201', product:'Jira', title:'Implement session refresh', description:'Refresh the authentication session before a customer submits payment.', status:'Done', related:['auth-reference'], retrievedAt:created },
  { id:'MOB-118', product:'Jira', title:'Fix responsive layout', description:'Correct wrapping of checkout totals and the order summary on narrow displays.', status:'To do', related:['PAY-156'], retrievedAt:created },
  { id:'PAY-171', product:'Jira', title:'Add payment failure handling', description:'Keep customer input intact when payment fails and show actionable recovery guidance.', status:'To do', related:['payment-architecture'], retrievedAt:created },
  { id:'checkout-guidelines', product:'Confluence', title:'Checkout Design Guidelines', description:'Keep one prominent primary action. Keep guest checkout, totals and confirmation accessible at all breakpoints.', status:'Reference', related:['PAY-142','mobile-accessibility'], retrievedAt:created },
  { id:'payment-architecture', product:'Confluence', title:'Payment Service Architecture', description:'The cart creates a payment intent. An accepted payment triggers order confirmation. Failed payments can be retried.', status:'Reference', related:['PAY-171'], retrievedAt:created },
  { id:'mobile-accessibility', product:'Confluence', title:'Mobile Accessibility Guidelines', description:'Give primary buttons an accessible touch target and keep focus visible after validation.', status:'Reference', related:['PAY-156'], retrievedAt:created },
  { id:'auth-reference', product:'Confluence', title:'Authentication API Reference', description:'Session refresh and guest session rules for first-party clients.', status:'Reference', related:['AUTH-201'], retrievedAt:created },
  { id:'billing-requirements', product:'Confluence', title:'Billing Information Requirements', description:'Collect only fields required by the payment processor and document validation errors.', status:'Reference', related:['PAY-142'], retrievedAt:created },
];

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
const rect = (id: string, x: number,y: number,width: number,height: number,strokeColor: string,backgroundColor: string) => ({
  id,type:'rectangle' as const,x,y,width,height,strokeColor,backgroundColor,roughness:0,strokeWidth:1,fillStyle:'solid' as const,roundness:{type:3 as const},
});
const label = (id: string, x: number,y: number,text: string,fontSize: number,strokeColor: string): Skeleton => ({
  id,type:'text',x,y,text,fontSize,fontFamily:2,strokeColor,
});
const arrow = (id:string,x:number,y:number,start:string,end:string): Skeleton => ({
  id,type:'arrow',x,y,width:28,height:0,points:[[0,0],[28,0]],strokeColor:'#9483bf',roughness:0,
  start:{id:start},end:{id:end},
});
export function makeScene(template: Template, demo = false): Scene {
  const scene = emptyScene();
  if (demo) {
    const elements: Skeleton[] = [
      label('eyebrow', 24, 7, 'PRODUCT / PAYMENTS', 13, '#7965bb'),
      label('heading', 24, 30, 'Checkout, simplified', 33, '#25203d'),
      label('subheading', 24, 80, 'Review the current experience and map a clearer path to payment.', 14, '#615a73'),
      label('shot-label', 24, 138, 'CURRENT EXPERIENCE', 12, '#65578c'),
      label('flow-label', 568, 138, 'PROPOSED FLOW', 12, '#65578c'),
      {id:'shot',type:'image',x:24,y:167,width:496,height:331,fileId:checkoutImageId as BinaryFileData['id'],status:'saved'},
      rect('cart', 568, 183, 95, 72, '#cec2ec', '#ede7fa'),
      label('cart-text', 594, 208, 'Cart', 17, '#392a64'),
      rect('pay', 697, 183, 108, 72, '#c0b0e8', '#e7ddfb'),
      label('pay-text', 714, 208, 'Payment', 16, '#392a64'),
      rect('confirm', 839, 183, 121, 72, '#bcddcf', '#e7f6ed'),
      label('confirm-text', 851, 208, 'Confirmation', 15, '#225f4b'),
      arrow('cart-pay', 666,219,'cart','pay'), arrow('pay-confirm', 808,219,'pay','confirm'),
      rect('note', 568, 291, 392, 85, '#ead7a4', '#fff4cf'),
      label('note-text', 585, 308, 'Keep payment visible on mobile\nPreserve input if payment fails.', 16, '#654a24'),
      label('work-label', 568, 412, 'LINKED WORK', 12, '#65578c'),
      rect('jira', 568, 438, 392, 70, '#dcd2ed', '#ffffff'),
      label('jira-key', 585, 448, 'JIRA  /  PAY-156  ·  To do', 11, '#7256bc'),
      label('jira-title', 585, 472, 'Improve mobile payment button', 15, '#25203d'),
    ];
    const pins = [
      { x:266, y:423, targetId:'shot', note:'The payment button falls below the fold on mobile.' },
      { x:264, y:291, targetId:'shot', note:'Can we make the email field clearer for guest checkout?' },
      { x:474, y:221, targetId:'shot', note:'Keep the order total visible before payment.' },
    ];
    for (const [i, pin] of pins.entries()) {
      const elementId = 'pin-' + (i + 1);
      elements.push({ ...rect(elementId,pin.x,pin.y,29,29,'#fff','#7655d5'),type:'ellipse', label:{text:String(i+1),fontSize:14,strokeColor:'#ffffff',fontFamily:2} });
      scene.annotations.push({ id:crypto.randomUUID(), elementId, targetId:pin.targetId, number:i+1, note:pin.note, extractedText:'', resolved:false });
    }
    scene.elements = convertToExcalidrawElements(elements, { regenerateIds:false }) as unknown as Scene['elements'];
    scene.files[checkoutImageId]=makeCheckoutCapture();
    scene.references.jira = { source:demoSources[1], targetIds:['pin-1'], provenance:'manual' };
  } else if (template !== 'Blank canvas') {
    const steps: Record<Exclude<Template,'Blank canvas'>, string[]> = {
      'Bug report':['Observed behavior','Expected behavior','Evidence'],
      'Feature brainstorming':['Problem','Ideas','Next steps'],
      'Architecture diagram':['Client','Service','Data'],
      'Design review':['Design','Feedback','Decisions'],
      'User flow':['Entry point','Action','Outcome'],
    };
    const elements: Skeleton[] = [label('title',40,35,template,31,'#392a64')];
    steps[template].forEach((step,i) => {
      elements.push({ ...rect('step-'+i,40+i*224,108,176,96,'#bba9e9','#f0eafa'),label:{text:step,fontSize:17,fontFamily:2,strokeColor:'#392a64'} });
      if (i) elements.push(arrow('connection-'+i,216+(i-1)*224,156,'step-'+(i-1),'step-'+i));
    });
    scene.elements = convertToExcalidrawElements(elements,{regenerateIds:false}) as unknown as Scene['elements'];
  }
  return scene;
}

export function newWorkspace(name: string, template: Template, demo = false): Workspace {
  const now = Date.now();
  return { schemaVersion:1,id:crypto.randomUUID(),name,description:demo?'Mobile checkout review and delivery plan':'',template,
    favorite:demo,createdAt:now,updatedAt:now,revision:0,scene:makeScene(template,demo) };
}
