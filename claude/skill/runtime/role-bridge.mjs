// A caller's JSON, local hook or child process ID cannot authorize execution.
// No dispatch reservation is created in this release.
export const heldRoutingResult=(code,releaseCondition)=>({decision:'hold',routeStatus:'held',supportStatus:'unverified',route:null,executionEnvironment:null,hostPlatform:null,role:null,requested:null,authentication:null,reasons:[{code,releaseCondition}]});
const held=()=>heldRoutingResult('execution_identity_unverified','Implement a supported reservation path and verify the assignment-to-execution identity before running, observing or resuming.');
export async function runBridgeDispatch(){return held();}
export async function recordRoleObservation(){return held();}
export async function resumeRoleDispatch(){return held();}
