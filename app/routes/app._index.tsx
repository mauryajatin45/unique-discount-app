import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  TextField,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.appSettings.findUnique({ where: { shop } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: {
        shop,
        isActive: false,
        discountPercentageProduct: 10.0,
        discountPercentageStore: 15.0,
      }
    });
  }

  // To show metrics in a real app, you would query your DB for orders processed.
  // For the sake of this dashboard, we just pass the settings.
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const isActive = formData.get("isActive") === "true";
  const targetProductId = formData.get("targetProductId")?.toString();
  const discountPercentageProduct = parseFloat(formData.get("discountPercentageProduct")?.toString() || "10");
  const discountPercentageStore = parseFloat(formData.get("discountPercentageStore")?.toString() || "15");

  const settings = await prisma.appSettings.update({
    where: { shop },
    data: {
      isActive,
      targetProductId,
      discountPercentageProduct,
      discountPercentageStore,
    }
  });

  return { settings };
};

export default function Index() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [isActive, setIsActive] = useState(settings.isActive);
  const [targetProductId, setTargetProductId] = useState(settings.targetProductId || "");
  const [discountPercentageProduct, setDiscountPercentageProduct] = useState(settings.discountPercentageProduct?.toString() || "10");
  const [discountPercentageStore, setDiscountPercentageStore] = useState(settings.discountPercentageStore?.toString() || "15");

  const isSaving = fetcher.state === "submitting";
  const actionData = fetcher.data as any;

  useEffect(() => {
    if (actionData?.settings) {
      shopify.toast.show("Settings saved successfully!");
    }
  }, [actionData, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        isActive: isActive.toString(),
        targetProductId,
        discountPercentageProduct,
        discountPercentageStore,
      },
      { method: "POST" }
    );
  };

  const handleSelectProduct = async () => {
    try {
      const selection = await shopify.resourcePicker({ type: 'product', multiple: false, action: 'select' });
      if (selection && selection.length > 0) {
        setTargetProductId(selection[0].id);
      }
    } catch (err) {
      console.log("Resource picker cancelled or failed", err);
    }
  };

  return (
    <Page>
      <TitleBar title="Unique Custom Discount Code Dashboard" />
      <BlockStack gap="500">
        <Layout>
          
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Dashboard & Metrics
                </Text>
                
                <InlineStack align="space-between">
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200" width="48%">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">Webhooks Processed</Text>
                      <Text as="h3" variant="headingXl">1,204</Text>
                    </BlockStack>
                  </Box>
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200" width="48%">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">Codes Generated</Text>
                      <Text as="h3" variant="headingXl">2,408</Text>
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Offer Configuration
                </Text>

                <Banner
                  title={isActive ? "Offer is Currently Active" : "Offer is Currently Disabled"}
                  tone={isActive ? "success" : "warning"}
                >
                  <p>
                    {isActive 
                      ? "The system is currently listening for paid orders and will automatically generate the discounts."
                      : "The system is paused. No discounts will be generated for incoming orders until this is enabled."}
                  </p>
                  <div style={{ marginTop: '1rem' }}>
                    <Button onClick={() => setIsActive(!isActive)}>
                      {isActive ? "Deactivate Offer" : "Activate Offer"}
                    </Button>
                  </div>
                </Banner>

                <Divider />

                <Text as="h3" variant="headingMd">Target Settings</Text>

                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">Target Product:</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {targetProductId ? targetProductId : "None selected"}
                      </Text>
                      <Button onClick={handleSelectProduct}>Select Product</Button>
                    </InlineStack>
                  </InlineStack>

                  <TextField
                    label="Discount for Target Product (%)"
                    type="number"
                    value={discountPercentageProduct}
                    onChange={setDiscountPercentageProduct}
                    autoComplete="off"
                    helpText="e.g. 10 for 10% off the target product"
                  />

                  <TextField
                    label="Discount for Storewide (excluding target) (%)"
                    type="number"
                    value={discountPercentageStore}
                    onChange={setDiscountPercentageStore}
                    autoComplete="off"
                    helpText="e.g. 15 for 15% off everything else"
                  />
                </BlockStack>

                <InlineStack align="end">
                  <Button variant="primary" onClick={handleSave} loading={isSaving}>
                    Save Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

        </Layout>
      </BlockStack>
    </Page>
  );
}
