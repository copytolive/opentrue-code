'use strict';

(() => {
  const style = document.createElement('style');
  style.id = 'rw-agent-responsive-fix';
  style.textContent = `
    .rw-agent-row{flex-wrap:wrap!important;align-content:flex-start}
    .rw-agent-source,.rw-agent-mode,.rw-agent-button{flex:0 0 auto}
    .rw-agent-locator{flex:0 1 190px;min-width:140px;max-width:190px}
    .rw-agent-input{flex:1 1 220px;min-width:180px}
    #agentUndoButton{visibility:visible!important;display:inline-flex!important;align-items:center;justify-content:center}
    .rw-agent-git-actions,.rw-agent-drive-actions{flex-wrap:wrap}
    .rw-agent-git-actions .rw-agent-small-input{flex:1 1 180px;min-width:150px}
    @media (max-width:900px){
      .rw-agent-locator{flex-basis:160px;max-width:160px}
      .rw-agent-input{flex-basis:200px;min-width:160px}
    }
  `;
  document.head.appendChild(style);
})();
