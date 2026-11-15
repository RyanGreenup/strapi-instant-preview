import {
  unstable_useDocument as useDocument,
  useDocumentRBAC,
  useForm,
  useQueryParams,
} from "@strapi/strapi/admin";
import { useMemo } from "react";

import type { Attributes, ComponentSchemas } from "../logic/buildRevertValues";
import type { DocumentArgs, SaveDraft } from "../services/saveDraft";
import type { AutosaveTarget } from "./useAutosave";

import { buildValidParams } from "../logic/buildValidParams";
import { snapshotKey } from "../logic/snapshot";
import { useSaveDraftMutation } from "../services/saveDraft";

type Values = Record<string, unknown>;

interface AutosaveForm {
  values: Values;
  initialValues: Values;
  modified: boolean;
  isSubmitting: boolean;
  getValues: () => Values;
  validate: (
    showErrors: boolean,
    options: Record<string, string>,
  ) => Promise<{ errors?: unknown }>;
  onChange: (name: string, value: unknown) => void;
  setValues: (values: Values) => void;
  resetForm: (values: Values) => void;
}

interface AutosaveDocument {
  cachedDocument: unknown;
  attributes: Attributes | undefined;
  components: ComponentSchemas;
  hasDraftAndPublish: boolean;
  documentArgs: DocumentArgs;
  url: string;
  refetch: () => void;
  getInitialFormValues: () => Values | undefined;
}

interface AutosaveContext extends AutosaveForm, AutosaveDocument {
  saveDraft: SaveDraft;
  isSavedEntry: boolean;
  eligible: boolean;
  key: string;
  status: string | undefined;
}
const FORM_CONSUMER = "DraftAutosave";
const SINGLE_TYPES = "single-types";

const useAutosaveForm = (): AutosaveForm => {
  const values = useForm(FORM_CONSUMER, (form) => form.values as Values);
  const initialValues = useForm(
    FORM_CONSUMER,
    (form) => form.initialValues as Values,
  );
  const modified = useForm(FORM_CONSUMER, (form) => form.modified);
  const isSubmitting = useForm(FORM_CONSUMER, (form) => form.isSubmitting);
  const getValues = useForm(
    FORM_CONSUMER,
    (form) => form.getValues as () => Values,
  );
  const validate = useForm(FORM_CONSUMER, (form) => form.validate);
  const onChange = useForm(FORM_CONSUMER, (form) => form.onChange);
  const setValues = useForm(FORM_CONSUMER, (form) => form.setValues);
  const resetForm = useForm(FORM_CONSUMER, (form) => form.resetForm);

  return {
    values,
    initialValues,
    modified,
    isSubmitting,
    getValues,
    validate,
    onChange,
    setValues,
    resetForm,
  };
};

const useAutosaveDocument = (target: AutosaveTarget): AutosaveDocument => {
  const { model, collectionType, documentId } = target;
  const [{ query }] = useQueryParams();
  const params = useMemo(() => buildValidParams(query), [query]);
  // Match the edit view's arguments to share its cached document.
  const documentArgs = useMemo(
    () => ({
      collectionType,
      model,
      ...(documentId === undefined ? {} : { documentId }),
      ...(params === undefined ? {} : { params }),
    }),
    [collectionType, model, documentId, params],
  );
  const result = useDocument(documentArgs, {
    skip:
      (documentId === undefined || documentId === "") &&
      collectionType !== SINGLE_TYPES,
  });
  const url = `/content-manager/${collectionType}/${model}${
    collectionType !== SINGLE_TYPES && Boolean(documentId)
      ? `/${documentId}`
      : ""
  }`;

  return {
    documentArgs,
    url,
    cachedDocument: result.document,
    attributes: result.schema?.attributes,
    components: result.components,
    hasDraftAndPublish: result.schema?.options?.draftAndPublish === true,
    refetch: result.refetch,
    getInitialFormValues: result.getInitialFormValues,
  };
};

const useAutosaveContext = (
  target: AutosaveTarget,
  enabled: boolean,
): AutosaveContext => {
  const form = useAutosaveForm();
  const document = useAutosaveDocument(target);
  const [saveDraft] = useSaveDraftMutation();
  const canUpdate = useDocumentRBAC(FORM_CONSUMER, (rbac) => rbac.canUpdate);
  const { hasDraftAndPublish } = document;
  const isSavedEntry = Boolean(target.document?.documentId);
  const eligible =
    enabled &&
    hasDraftAndPublish &&
    isSavedEntry &&
    target.activeTab === "draft" &&
    canUpdate === true;

  return {
    ...form,
    ...document,
    saveDraft,
    hasDraftAndPublish,
    isSavedEntry,
    eligible,
    key: snapshotKey(
      target.model,
      target.document?.documentId,
      target.document?.locale,
    ),
    status: target.document?.status,
  };
};

export { useAutosaveContext };
export type { AutosaveContext, Values };
