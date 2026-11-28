/** What the Hyper-V firewall means for a phone reaching the engine in WSL. */
export type PhoneFirewall =
  | { readonly kind: "not_applicable" }
  | { readonly kind: "open" }
  | { readonly kind: "blocked"; readonly port: number };

export const WSL_VM_CREATOR_ID = "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}";

/** The admin PowerShell line the user runs to let a phone in. The app only shows it. */
export const hyperVRuleCommand = (port: number) =>
  `New-NetFirewallHyperVRule -Name AgentBoardPhone -DisplayName "Agent Board phone (${port})" -Direction Inbound -VMCreatorId '${WSL_VM_CREATOR_ID}' -Protocol TCP -LocalPorts ${port} -Action Allow`;
