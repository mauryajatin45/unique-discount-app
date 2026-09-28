import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  // 3. Add to state
  let newFile = file.replace(
    'const [isActive, setIsActive] = useState(settings.isActive);',
    'const [isActive, setIsActive] = useState(settings.isActive);\n  const [isOdooActive, setIsOdooActive] = useState(settings.isOdooActive ?? true);'
  );
  
  // 4. Add to hidden inputs
  newFile = newFile.replace(
    '<input type="hidden" name="isActive" value={isActive.toString()} />',
    '<input type="hidden" name="isActive" value={isActive.toString()} />\n              <input type="hidden" name="isOdooActive" value={isOdooActive.toString()} />'
  );
  
  // 5. Add to frontend form
  const shopifyToggle = `<BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Enable Automation Engine
                  </Text>
                  <ChoiceList
                    title="Toggle Automation"
                    titleHidden
                    choices={[
                      { label: "Active", value: "true" },
                      { label: "Paused", value: "false" },
                    ]}
                    selected={isActive ? ["true"] : ["false"]}
                    onChange={(value) => setIsActive(value[0] === "true")}
                  />
                </BlockStack>`;
                
  const newToggles = `${shopifyToggle}
                
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Enable Odoo Automation
                  </Text>
                  <ChoiceList
                    title="Toggle Odoo"
                    titleHidden
                    choices={[
                      { label: "Active", value: "true" },
                      { label: "Paused", value: "false" },
                    ]}
                    selected={isOdooActive ? ["true"] : ["false"]}
                    onChange={(value) => setIsOdooActive(value[0] === "true")}
                  />
                </BlockStack>`;
                
  newFile = newFile.replace(shopifyToggle, newToggles);
  
  await fs.writeFile('app/routes/app.settings.tsx', newFile);
  console.log("Patched app.settings.tsx state and UI");
}
run();
