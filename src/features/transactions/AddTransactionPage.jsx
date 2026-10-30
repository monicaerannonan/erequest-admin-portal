import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getActiveServices,
  getTransactionById,
  addTransaction,
  updateTransaction
} from "./services/transactionService";
import {
  getRequirementsByTransactionId,
  addRequirement,
  updateRequirement,
  deleteRequirement
} from "./services/requirementService";
import {
  getProcedureStepsByTransactionId,
  addProcedureStep,
  updateProcedureStep,
  deleteProcedureStep
} from "./services/procedureService";
import {
  getGuidelinesByTransactionId,
  addGuideline,
  updateGuideline,
  deleteGuideline
} from "./services/guidelineService";
import { uploadProcedureImage } from "../../services/cloudinaryService";
import "./AddTransactionPage.css";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatTime12Hour(time24) {
  if (!time24 || !time24.includes(":")) return "";
  const [hourStr, minuteStr] = time24.split(":");
  const hourNum = Number(hourStr);
  if (Number.isNaN(hourNum)) return "";
  const period = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 || 12;
  return `${hour12}:${minuteStr} ${period}`;
}

function formatSelectedDays(selectedDays) {
  const ordered = DAYS_OF_WEEK.filter((d) => selectedDays.includes(d));
  if (ordered.length === 0) return "";
  if (ordered.length === 1) return ordered[0];

  const indices = ordered.map((d) => DAYS_OF_WEEK.indexOf(d));
  const isContiguous = indices.every(
    (val, idx) => idx === 0 || val === indices[idx - 1] + 1
  );

  if (isContiguous && ordered.length >= 2) {
    return `${ordered[0]} - ${ordered[ordered.length - 1]}`;
  }

  return ordered.join(", ");
}

function buildOfficeScheduleString(days, fromTime, toTime) {
  const dayPart = formatSelectedDays(days);
  const fromPart = formatTime12Hour(fromTime);
  const toPart = formatTime12Hour(toTime);
  const timePart =
    fromPart && toPart ? `${fromPart} - ${toPart}` : fromPart || toPart || "";

  if (dayPart && timePart) {
    return `${dayPart}, ${timePart}`;
  }
  return dayPart || timePart || "";
}

function parseOfficeSchedule(scheduleStr) {
  const defaultResult = {
    days: [],
    from: "08:00",
    to: "17:00"
  };

  if (!scheduleStr || typeof scheduleStr !== "string") {
    return defaultResult;
  }

  const normalized = scheduleStr
    .replace(/monday/gi, "Mon")
    .replace(/tuesday/gi, "Tue")
    .replace(/wednesday/gi, "Wed")
    .replace(/thursday/gi, "Thu")
    .replace(/friday/gi, "Fri")
    .replace(/saturday/gi, "Sat")
    .replace(/sunday/gi, "Sun");

  const foundDays = new Set();
  const rangeRegex =
    /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(?:-|–|to)\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi;
  let rangeMatch;
  while ((rangeMatch = rangeRegex.exec(normalized)) !== null) {
    const startDay =
      rangeMatch[1].charAt(0).toUpperCase() +
      rangeMatch[1].slice(1, 3).toLowerCase();
    const endDay =
      rangeMatch[2].charAt(0).toUpperCase() +
      rangeMatch[2].slice(1, 3).toLowerCase();
    const startIdx = DAYS_OF_WEEK.indexOf(startDay);
    const endIdx = DAYS_OF_WEEK.indexOf(endDay);
    if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
      for (let i = startIdx; i <= endIdx; i++) {
        foundDays.add(DAYS_OF_WEEK[i]);
      }
    }
  }

  const singleDayRegex = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi;
  let dayMatch;
  while ((dayMatch = singleDayRegex.exec(normalized)) !== null) {
    const dayName =
      dayMatch[1].charAt(0).toUpperCase() +
      dayMatch[1].slice(1, 3).toLowerCase();
    if (DAYS_OF_WEEK.includes(dayName)) {
      foundDays.add(dayName);
    }
  }

  const timeRegex = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
  const times = [];
  let timeMatch;
  while ((timeMatch = timeRegex.exec(normalized)) !== null) {
    let hours = Number(timeMatch[1]);
    const minutes = timeMatch[2];
    const period = timeMatch[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    times.push(`${String(hours).padStart(2, "0")}:${minutes}`);
  }

  return {
    days: DAYS_OF_WEEK.filter((d) => foundDays.has(d)),
    from: times[0] || "08:00",
    to: times[1] || "17:00"
  };
}

function normalizeWebsiteUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function AddTransactionPage() {
  const navigate = useNavigate();
  const { transactionId } = useParams();
  const isEditMode = Boolean(transactionId);

  // Basic Information State
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [officeSchedule, setOfficeSchedule] = useState("");
  const [scheduleDays, setScheduleDays] = useState([]);
  const [scheduleTimeFrom, setScheduleTimeFrom] = useState("08:00");
  const [scheduleTimeTo, setScheduleTimeTo] = useState("17:00");

  // 1. Requirements Section State (Collapsed by default)
  const [requirements, setRequirements] = useState([]);
  const [deletedReqIds, setDeletedReqIds] = useState([]);
  const [showReqForm, setShowReqForm] = useState(false);
  const [editingReqId, setEditingReqId] = useState(null);
  const [reqDraftText, setReqDraftText] = useState("");
  const [reqDraftOrder, setReqDraftOrder] = useState("1");
  const [reqSectionError, setReqSectionError] = useState("");

  // 2. Step-by-Step Procedure Section State (Collapsed by default)
  const [procedures, setProcedures] = useState([]);
  const [deletedProcIds, setDeletedProcIds] = useState([]);
  const [showProcForm, setShowProcForm] = useState(false);
  const [editingProcId, setEditingProcId] = useState(null);
  const [procDraftStepNumber, setProcDraftStepNumber] = useState("1");
  const [procDraftInstruction, setProcDraftInstruction] = useState("");
  const [procDraftWebsiteName, setProcDraftWebsiteName] = useState("");
  const [procDraftWebsiteUrl, setProcDraftWebsiteUrl] = useState("");
  const [procDraftImageFile, setProcDraftImageFile] = useState(null);
  const [procDraftImagePreview, setProcDraftImagePreview] = useState("");
  const [procDraftImageCaption, setProcDraftImageCaption] = useState("");
  const [procSectionError, setProcSectionError] = useState("");

  // 3. Guidelines Section State (Collapsed by default)
  const [guidelines, setGuidelines] = useState([]);
  const [deletedGuideIds, setDeletedGuideIds] = useState([]);
  const [showGuideForm, setShowGuideForm] = useState(false);
  const [editingGuideId, setEditingGuideId] = useState(null);
  const [guideDraftText, setGuideDraftText] = useState("");
  const [guideDraftOrder, setGuideDraftOrder] = useState("1");
  const [guideSectionError, setGuideSectionError] = useState("");

  // Page & Submission State
  const [loadingPage, setLoadingPage] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    const loadInitialData = async () => {
      try {
        setLoadingPage(true);
        setErrorMessage("");
        setNotFound(false);

        if (isEditMode) {
          const [
            activeServices,
            existingTx,
            existingReqs,
            existingProcs,
            existingGuides
          ] = await Promise.all([
            getActiveServices(),
            getTransactionById(transactionId),
            getRequirementsByTransactionId(transactionId),
            getProcedureStepsByTransactionId(transactionId),
            getGuidelinesByTransactionId(transactionId)
          ]);

          if (ignore) return;

          setServices(activeServices);

          if (!existingTx) {
            setNotFound(true);
            setErrorMessage("Transaction / Document not found.");
            return;
          }

          setServiceId(existingTx.serviceId || "");
          setName(existingTx.name || "");
          setDescription(existingTx.description || "");
          setOfficeName(existingTx.officeName || "");
          setOfficeSchedule(existingTx.officeSchedule || "");
          const parsedSchedule = parseOfficeSchedule(existingTx.officeSchedule);
          setScheduleDays(parsedSchedule.days);
          setScheduleTimeFrom(parsedSchedule.from);
          setScheduleTimeTo(parsedSchedule.to);

          const mappedReqs = existingReqs.map((req, idx) => ({
            id: req.id,
            requirementText: req.requirementText || "",
            displayOrder: Number(req.displayOrder) || idx + 1,
            isExisting: true,
            isModified: false
          }));
          setRequirements(mappedReqs);
          setReqDraftOrder(String(mappedReqs.length + 1));

          const mappedProcs = existingProcs.map((proc, idx) => ({
            id: proc.id,
            stepNumber: Number(proc.stepNumber) || idx + 1,
            instruction: proc.instruction || "",
            websiteName: proc.websiteName || "",
            websiteUrl: proc.websiteUrl || "",
            remoteImageUrl: proc.remoteImageUrl || "",
            localImagePath: proc.localImagePath || "",
            imageFile: null,
            imagePreview: proc.remoteImageUrl || "",
            imageCaption: proc.imageCaption || "",
            isExisting: true,
            isModified: false
          }));
          setProcedures(mappedProcs);
          const nextStep =
            mappedProcs.length > 0
              ? Math.max(...mappedProcs.map((s) => s.stepNumber)) + 1
              : 1;
          setProcDraftStepNumber(String(nextStep));

          const mappedGuides = existingGuides.map((guide, idx) => ({
            id: guide.id,
            guidelineText: guide.guidelineText || "",
            displayOrder: Number(guide.displayOrder) || idx + 1,
            isExisting: true,
            isModified: false
          }));
          setGuidelines(mappedGuides);
          setGuideDraftOrder(String(mappedGuides.length + 1));
        } else {
          const activeServices = await getActiveServices();
          if (ignore) return;
          setServices(activeServices);
        }
      } catch (error) {
        console.error("Failed to load transaction form data:", error);
        if (!ignore) {
          setErrorMessage(
            isEditMode
              ? "Failed to load transaction details."
              : "Failed to load active services."
          );
        }
      } finally {
        if (!ignore) {
          setLoadingPage(false);
        }
      }
    };

    loadInitialData();

    return () => {
      ignore = true;
    };
  }, [isEditMode, transactionId]);

  // ==========================================
  // 0. OFFICE SCHEDULE HANDLERS
  // ==========================================
  const handleToggleScheduleDay = (day) => {
    const nextDays = scheduleDays.includes(day)
      ? scheduleDays.filter((d) => d !== day)
      : DAYS_OF_WEEK.filter((d) => d === day || scheduleDays.includes(d));
    setScheduleDays(nextDays);
    setOfficeSchedule(
      buildOfficeScheduleString(nextDays, scheduleTimeFrom, scheduleTimeTo)
    );
  };

  const handleScheduleTimeFromChange = (newFrom) => {
    setScheduleTimeFrom(newFrom);
    setOfficeSchedule(
      buildOfficeScheduleString(scheduleDays, newFrom, scheduleTimeTo)
    );
  };

  const handleScheduleTimeToChange = (newTo) => {
    setScheduleTimeTo(newTo);
    setOfficeSchedule(
      buildOfficeScheduleString(scheduleDays, scheduleTimeFrom, newTo)
    );
  };

  const handleOfficeScheduleTextChange = (value) => {
    setOfficeSchedule(value);
    const parsed = parseOfficeSchedule(value);
    setScheduleDays(parsed.days);
    if (parsed.from) setScheduleTimeFrom(parsed.from);
    if (parsed.to) setScheduleTimeTo(parsed.to);
  };

  // ==========================================
  // 1. REQUIREMENTS HANDLERS
  // ==========================================
  const handleOpenAddRequirement = () => {
    setReqSectionError("");
    setEditingReqId(null);
    setReqDraftText("");
    setReqDraftOrder(String(requirements.length + 1));
    setShowReqForm(true);
  };

  const handleOpenEditRequirement = (item) => {
    setReqSectionError("");
    setEditingReqId(item.id);
    setReqDraftText(item.requirementText);
    setReqDraftOrder(String(item.displayOrder));
    setShowReqForm(true);
  };

  const handleCloseReqForm = () => {
    setShowReqForm(false);
    setEditingReqId(null);
    setReqDraftText("");
    setReqDraftOrder(String(requirements.length + 1));
    setReqSectionError("");
  };

  const handleSaveRequirementItem = () => {
    setReqSectionError("");
    const trimmedText = reqDraftText.trim();
    const parsedOrder = Number(reqDraftOrder);

    if (!trimmedText) {
      setReqSectionError("Requirement description is required.");
      return;
    }

    if (!Number.isInteger(parsedOrder) || parsedOrder < 1) {
      setReqSectionError("Display order must be a whole number starting from 1.");
      return;
    }

    const isDuplicate = requirements.some(
      (item) =>
        item.id !== editingReqId &&
        item.requirementText.toLowerCase() === trimmedText.toLowerCase()
    );
    if (isDuplicate) {
      setReqSectionError("This requirement has already been added to the list.");
      return;
    }

    let updated;
    if (editingReqId) {
      updated = requirements
        .map((item) =>
          item.id === editingReqId
            ? {
                ...item,
                requirementText: trimmedText,
                displayOrder: parsedOrder,
                isModified: true
              }
            : item
        )
        .sort((a, b) => a.displayOrder - b.displayOrder);
    } else {
      updated = [
        ...requirements,
        {
          id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          requirementText: trimmedText,
          displayOrder: parsedOrder,
          isExisting: false,
          isModified: false
        }
      ].sort((a, b) => a.displayOrder - b.displayOrder);
    }

    setRequirements(updated);
    setShowReqForm(false);
    setEditingReqId(null);
    setReqDraftText("");
    setReqDraftOrder(String(updated.length + 1));
  };

  const handleRemoveRequirement = (id) => {
    const target = requirements.find((item) => item.id === id);
    if (target?.isExisting) {
      setDeletedReqIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }

    const filtered = requirements
      .filter((item) => item.id !== id)
      .map((item, idx) => ({
        ...item,
        displayOrder: idx + 1,
        isModified: item.isExisting ? true : item.isModified
      }));
    setRequirements(filtered);
    setReqDraftOrder(String(filtered.length + 1));
    if (editingReqId === id) {
      handleCloseReqForm();
    }
  };

  // ==========================================
  // 2. PROCEDURE STEPS HANDLERS
  // ==========================================
  const handleOpenAddProcedure = () => {
    setProcSectionError("");
    setEditingProcId(null);
    const nextStep =
      procedures.length > 0
        ? Math.max(...procedures.map((s) => s.stepNumber)) + 1
        : 1;
    setProcDraftStepNumber(String(nextStep));
    setProcDraftInstruction("");
    setProcDraftWebsiteName("");
    setProcDraftWebsiteUrl("");
    setProcDraftImageFile(null);
    setProcDraftImagePreview("");
    setProcDraftImageCaption("");
    setShowProcForm(true);
  };

  const handleOpenEditProcedure = (item) => {
    setProcSectionError("");
    setEditingProcId(item.id);
    setProcDraftStepNumber(String(item.stepNumber));
    setProcDraftInstruction(item.instruction);
    setProcDraftWebsiteName(item.websiteName || "");
    setProcDraftWebsiteUrl(item.websiteUrl || "");
    setProcDraftImageFile(item.imageFile || null);
    setProcDraftImagePreview(item.imagePreview || item.remoteImageUrl || "");
    setProcDraftImageCaption(item.imageCaption || "");
    setShowProcForm(true);
  };

  const handleCloseProcForm = () => {
    setShowProcForm(false);
    setEditingProcId(null);
    const nextStep =
      procedures.length > 0
        ? Math.max(...procedures.map((s) => s.stepNumber)) + 1
        : 1;
    setProcDraftStepNumber(String(nextStep));
    setProcDraftInstruction("");
    setProcDraftWebsiteName("");
    setProcDraftWebsiteUrl("");
    setProcDraftImageFile(null);
    setProcDraftImagePreview("");
    setProcDraftImageCaption("");
    setProcSectionError("");
  };

  const handleProcDraftImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProcSectionError("Please select a valid image file (PNG, JPG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProcSectionError("Image size must not exceed 5 MB.");
      return;
    }

    setProcSectionError("");
    setProcDraftImageFile(file);
    setProcDraftImagePreview(URL.createObjectURL(file));
  };

  const handleClearProcDraftImage = () => {
    setProcDraftImageFile(null);
    setProcDraftImagePreview("");
    setProcDraftImageCaption("");
  };

  const handleSaveProcedureItem = () => {
    setProcSectionError("");
    const parsedStep = Number(procDraftStepNumber);
    const trimmedInstruction = procDraftInstruction.trim();
    const trimmedWebName = procDraftWebsiteName.trim();
    const trimmedWebUrl = normalizeWebsiteUrl(procDraftWebsiteUrl);

    if (!Number.isInteger(parsedStep) || parsedStep < 1) {
      setProcSectionError("Step number must be a whole number starting from 1.");
      return;
    }

    if (!trimmedInstruction) {
      setProcSectionError("Step instruction is required.");
      return;
    }

    if (trimmedWebUrl && !trimmedWebName) {
      setProcSectionError("Please enter a Website / Link Name for the URL.");
      return;
    }

    if (trimmedWebName && !trimmedWebUrl) {
      setProcSectionError("Please enter the Website URL for the link name.");
      return;
    }

    const stepExists = procedures.some(
      (item) => item.id !== editingProcId && item.stepNumber === parsedStep
    );
    if (stepExists) {
      setProcSectionError(
        `Step ${parsedStep} already exists. Please choose another step number.`
      );
      return;
    }

    let updated;
    if (editingProcId) {
      updated = procedures
        .map((item) =>
          item.id === editingProcId
            ? {
                ...item,
                stepNumber: parsedStep,
                instruction: trimmedInstruction,
                websiteName: trimmedWebName,
                websiteUrl: trimmedWebUrl,
                imageFile: procDraftImageFile,
                imagePreview: procDraftImagePreview,
                remoteImageUrl: procDraftImageFile
                  ? ""
                  : procDraftImagePreview
                    ? item.remoteImageUrl || procDraftImagePreview
                    : "",
                imageCaption: procDraftImagePreview
                  ? procDraftImageCaption.trim()
                  : "",
                isModified: true
              }
            : item
        )
        .sort((a, b) => a.stepNumber - b.stepNumber);
    } else {
      updated = [
        ...procedures,
        {
          id: `proc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          stepNumber: parsedStep,
          instruction: trimmedInstruction,
          websiteName: trimmedWebName,
          websiteUrl: trimmedWebUrl,
          remoteImageUrl: "",
          localImagePath: "",
          imageFile: procDraftImageFile,
          imagePreview: procDraftImagePreview,
          imageCaption: procDraftImagePreview
            ? procDraftImageCaption.trim()
            : "",
          isExisting: false,
          isModified: false
        }
      ].sort((a, b) => a.stepNumber - b.stepNumber);
    }

    setProcedures(updated);
    setShowProcForm(false);
    setEditingProcId(null);
    const nextStep =
      updated.length > 0
        ? Math.max(...updated.map((s) => s.stepNumber)) + 1
        : 1;
    setProcDraftStepNumber(String(nextStep));
    setProcDraftInstruction("");
    setProcDraftWebsiteName("");
    setProcDraftWebsiteUrl("");
    setProcDraftImageFile(null);
    setProcDraftImagePreview("");
    setProcDraftImageCaption("");
  };

  const handleRemoveProcedure = (id) => {
    const target = procedures.find((item) => item.id === id);
    if (target?.isExisting) {
      setDeletedProcIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }

    const filtered = procedures
      .filter((item) => item.id !== id)
      .map((item, idx) => ({
        ...item,
        stepNumber: idx + 1,
        isModified: item.isExisting ? true : item.isModified
      }));
    setProcedures(filtered);
    setProcDraftStepNumber(String(filtered.length + 1));
    if (editingProcId === id) {
      handleCloseProcForm();
    }
  };

  // ==========================================
  // 3. GUIDELINES HANDLERS
  // ==========================================
  const handleOpenAddGuideline = () => {
    setGuideSectionError("");
    setEditingGuideId(null);
    setGuideDraftText("");
    setGuideDraftOrder(String(guidelines.length + 1));
    setShowGuideForm(true);
  };

  const handleOpenEditGuideline = (item) => {
    setGuideSectionError("");
    setEditingGuideId(item.id);
    setGuideDraftText(item.guidelineText);
    setGuideDraftOrder(String(item.displayOrder));
    setShowGuideForm(true);
  };

  const handleCloseGuideForm = () => {
    setShowGuideForm(false);
    setEditingGuideId(null);
    setGuideDraftText("");
    setGuideDraftOrder(String(guidelines.length + 1));
    setGuideSectionError("");
  };

  const handleSaveGuidelineItem = () => {
    setGuideSectionError("");
    const trimmedText = guideDraftText.trim();
    const parsedOrder = Number(guideDraftOrder);

    if (!trimmedText) {
      setGuideSectionError("Guideline text is required.");
      return;
    }

    if (!Number.isInteger(parsedOrder) || parsedOrder < 1) {
      setGuideSectionError("Display order must be a whole number starting from 1.");
      return;
    }

    const isDuplicate = guidelines.some(
      (item) =>
        item.id !== editingGuideId &&
        item.guidelineText.toLowerCase() === trimmedText.toLowerCase()
    );
    if (isDuplicate) {
      setGuideSectionError("This guideline has already been added to the list.");
      return;
    }

    let updated;
    if (editingGuideId) {
      updated = guidelines
        .map((item) =>
          item.id === editingGuideId
            ? {
                ...item,
                guidelineText: trimmedText,
                displayOrder: parsedOrder,
                isModified: true
              }
            : item
        )
        .sort((a, b) => a.displayOrder - b.displayOrder);
    } else {
      updated = [
        ...guidelines,
        {
          id: `guide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          guidelineText: trimmedText,
          displayOrder: parsedOrder,
          isExisting: false,
          isModified: false
        }
      ].sort((a, b) => a.displayOrder - b.displayOrder);
    }

    setGuidelines(updated);
    setShowGuideForm(false);
    setEditingGuideId(null);
    setGuideDraftText("");
    setGuideDraftOrder(String(updated.length + 1));
  };

  const handleRemoveGuideline = (id) => {
    const target = guidelines.find((item) => item.id === id);
    if (target?.isExisting) {
      setDeletedGuideIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }

    const filtered = guidelines
      .filter((item) => item.id !== id)
      .map((item, idx) => ({
        ...item,
        displayOrder: idx + 1,
        isModified: item.isExisting ? true : item.isModified
      }));
    setGuidelines(filtered);
    setGuideDraftOrder(String(filtered.length + 1));
    if (editingGuideId === id) {
      handleCloseGuideForm();
    }
  };

  // ==========================================
  // UNIFIED FORM SUBMISSION (CREATE OR UPDATE)
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setReqSectionError("");
    setProcSectionError("");
    setGuideSectionError("");

    if (!serviceId) {
      setErrorMessage("Please select a service in Basic Information.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!name.trim()) {
      setErrorMessage("Transaction / Document name is required.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Collect final lists (including any un-submitted draft if a collapsible form is open)
    const finalRequirements = [...requirements];
    if (showReqForm && !editingReqId && reqDraftText.trim()) {
      const parsedOrder = Number(reqDraftOrder) || finalRequirements.length + 1;
      const exists = finalRequirements.some(
        (r) =>
          r.requirementText.toLowerCase() === reqDraftText.trim().toLowerCase()
      );
      if (!exists) {
        finalRequirements.push({
          id: `req_pending_${Date.now()}`,
          requirementText: reqDraftText.trim(),
          displayOrder:
            parsedOrder > 0 ? parsedOrder : finalRequirements.length + 1,
          isExisting: false,
          isModified: false
        });
      }
    }

    const finalProcedures = [...procedures];
    if (showProcForm && !editingProcId && procDraftInstruction.trim()) {
      const parsedStep =
        Number(procDraftStepNumber) || finalProcedures.length + 1;
      const stepConflict = finalProcedures.some(
        (p) => p.stepNumber === parsedStep
      );
      const resolvedStepNumber = stepConflict
        ? Math.max(0, ...finalProcedures.map((p) => p.stepNumber)) + 1
        : parsedStep;
      const normalizedUrl = normalizeWebsiteUrl(procDraftWebsiteUrl);
      const resolvedWebName =
        procDraftWebsiteName.trim() || (normalizedUrl ? "Reference Link" : "");

      finalProcedures.push({
        id: `proc_pending_${Date.now()}`,
        stepNumber: resolvedStepNumber,
        instruction: procDraftInstruction.trim(),
        websiteName: resolvedWebName,
        websiteUrl: normalizedUrl,
        remoteImageUrl: "",
        localImagePath: "",
        imageFile: procDraftImageFile,
        imagePreview: procDraftImagePreview,
        imageCaption: procDraftImageCaption.trim(),
        isExisting: false,
        isModified: false
      });
    }

    const finalGuidelines = [...guidelines];
    if (showGuideForm && !editingGuideId && guideDraftText.trim()) {
      const parsedOrder = Number(guideDraftOrder) || finalGuidelines.length + 1;
      const exists = finalGuidelines.some(
        (g) =>
          g.guidelineText.toLowerCase() === guideDraftText.trim().toLowerCase()
      );
      if (!exists) {
        finalGuidelines.push({
          id: `guide_pending_${Date.now()}`,
          guidelineText: guideDraftText.trim(),
          displayOrder:
            parsedOrder > 0 ? parsedOrder : finalGuidelines.length + 1,
          isExisting: false,
          isModified: false
        });
      }
    }

    try {
      setSaving(true);

      // UPLOAD-FIRST STRATEGY:
      // Upload all local procedure step images to Cloudinary in parallel BEFORE writing
      // or updating any records in Firestore so no partial database state is left
      // if an image upload fails.
      setSavingStatus("Preparing procedure images...");
      const preparedProcedures = await Promise.all(
        finalProcedures.map(async (step) => {
          let resolvedImageUrl = step.remoteImageUrl || "";
          let wasImageUploaded = false;

          if (step.imageFile) {
            resolvedImageUrl = await uploadProcedureImage(step.imageFile);
            wasImageUploaded = true;

            // Cache uploaded URL in component state so retries do not re-upload
            setProcedures((prev) =>
              prev.map((item) =>
                item.id === step.id
                  ? {
                      ...item,
                      remoteImageUrl: resolvedImageUrl,
                      imagePreview: resolvedImageUrl,
                      imageFile: null,
                      isModified: true
                    }
                  : item
              )
            );
          }

          return {
            ...step,
            resolvedImageUrl,
            wasImageUploaded
          };
        })
      );

      if (isEditMode) {
        setSavingStatus("Saving transaction updates...");

        await Promise.all([
          // 1. Update Basic Information
          updateTransaction(
            transactionId,
            serviceId,
            name,
            description,
            officeName,
            officeSchedule
          ),

          // 2. Sync Requirements (delete removed items in parallel, update modified in place, add new)
          Promise.all([
            ...deletedReqIds.map((id) => deleteRequirement(id)),
            ...finalRequirements.map((req) => {
              if (!req.isExisting) {
                return addRequirement(
                  transactionId,
                  req.requirementText,
                  req.displayOrder
                );
              }
              if (req.isModified) {
                return updateRequirement(
                  req.id,
                  transactionId,
                  req.requirementText,
                  req.displayOrder
                );
              }
              return Promise.resolve();
            })
          ]),

          // 3. Sync Procedure Steps (delete removed items in parallel, update modified in place, add new)
          Promise.all([
            ...deletedProcIds.map((id) => deleteProcedureStep(id)),
            ...preparedProcedures.map((step) => {
              const finalImageUrl = step.resolvedImageUrl || "";
              if (!step.isExisting) {
                return addProcedureStep(
                  transactionId,
                  step.stepNumber,
                  step.instruction,
                  finalImageUrl ? step.imageCaption : "",
                  finalImageUrl,
                  step.localImagePath || "",
                  step.websiteName || "",
                  step.websiteUrl || ""
                );
              }
              if (step.isModified || step.wasImageUploaded) {
                return updateProcedureStep(
                  step.id,
                  transactionId,
                  step.stepNumber,
                  step.instruction,
                  finalImageUrl ? step.imageCaption : "",
                  finalImageUrl,
                  step.localImagePath || "",
                  step.websiteName || "",
                  step.websiteUrl || ""
                );
              }
              return Promise.resolve();
            })
          ]),

          // 4. Sync Guidelines (delete removed items in parallel, update modified in place, add new)
          Promise.all([
            ...deletedGuideIds.map((id) => deleteGuideline(id)),
            ...finalGuidelines.map((guide) => {
              if (!guide.isExisting) {
                return addGuideline(
                  transactionId,
                  guide.guidelineText,
                  guide.displayOrder
                );
              }
              if (guide.isModified) {
                return updateGuideline(
                  guide.id,
                  transactionId,
                  guide.guidelineText,
                  guide.displayOrder
                );
              }
              return Promise.resolve();
            })
          ])
        ]);

        navigate("/transactions", {
          replace: true,
          state: {
            successMessage: `Transaction "${name.trim()}" updated successfully.`
          }
        });
      } else {
        // CREATE MODE
        setSavingStatus("Creating transaction record...");

        const createdTransactionId = await addTransaction(
          serviceId,
          name,
          description,
          officeName,
          officeSchedule
        );

        setSavingStatus("Saving transaction items...");
        await Promise.all([
          Promise.all(
            finalRequirements.map((req) =>
              addRequirement(
                createdTransactionId,
                req.requirementText,
                req.displayOrder
              )
            )
          ),
          Promise.all(
            preparedProcedures.map((step) => {
              const uploadedImageUrl = step.resolvedImageUrl || "";
              return addProcedureStep(
                createdTransactionId,
                step.stepNumber,
                step.instruction,
                uploadedImageUrl ? step.imageCaption : "",
                uploadedImageUrl,
                "",
                step.websiteName || "",
                step.websiteUrl || ""
              );
            })
          ),
          Promise.all(
            finalGuidelines.map((guide) =>
              addGuideline(
                createdTransactionId,
                guide.guidelineText,
                guide.displayOrder
              )
            )
          )
        ]);

        navigate("/transactions", {
          replace: true,
          state: {
            successMessage: `Transaction "${name.trim()}" created successfully with ${finalRequirements.length} requirement(s), ${preparedProcedures.length} step(s), and ${finalGuidelines.length} guideline(s).`
          }
        });
      }
    } catch (error) {
      console.error("Failed to save transaction:", error);
      setErrorMessage(
        error.message ||
          (isEditMode
            ? "Failed to update transaction."
            : "Failed to add transaction.")
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
      setSavingStatus("");
    }
  };

  if (loadingPage) {
    return (
      <div className="add-transaction-page">
        <div className="add-transaction-container">
          <header className="add-transaction-header">
            <button
              type="button"
              className="add-transaction-back-button"
              onClick={() => navigate("/transactions")}
            >
              ← Back to Transactions
            </button>
            <h1>
              {isEditMode
                ? "Edit Transaction / Document"
                : "Add Transaction / Document"}
            </h1>
          </header>

          <section className="add-transaction-card">
            <p className="add-tx-empty-list">
              Loading transaction details...
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="add-transaction-page">
        <div className="add-transaction-container">
          <header className="add-transaction-header">
            <button
              type="button"
              className="add-transaction-back-button"
              onClick={() => navigate("/transactions")}
            >
              ← Back to Transactions
            </button>
            <h1>Edit Transaction / Document</h1>
          </header>

          <section className="add-transaction-card">
            <div className="add-transaction-error">
              {errorMessage || "Transaction / Document not found."}
            </div>
            <button
              type="button"
              className="add-transaction-cancel-button"
              onClick={() => navigate("/transactions")}
            >
              Back to Transactions
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="add-transaction-page">
      <div className="add-transaction-container">
        {/* HEADER */}
        <header className="add-transaction-header">
          <button
            type="button"
            className="add-transaction-back-button"
            onClick={() => navigate("/transactions")}
            disabled={saving}
          >
            ← Back to Transactions
          </button>

          <h1>
            {isEditMode
              ? "Edit Transaction / Document"
              : "Add Transaction / Document"}
          </h1>
          <p>
            {isEditMode
              ? "Update the basic information, requirements, step-by-step procedures, and guidelines for this transaction in one unified view."
              : "Fill out the basic information, requirements, step-by-step procedures, and guidelines in one unified view before creating the transaction."}
          </p>
        </header>

        {errorMessage && (
          <div className="add-transaction-error">{errorMessage}</div>
        )}

        <form onSubmit={handleSubmit} className="unified-add-transaction-form">
          {/* =====================================================
              SECTION 1: BASIC INFORMATION
          ===================================================== */}
          <section className="add-transaction-card add-tx-section-card">
            <div className="add-tx-section-header">
              <div>
                <h2 className="add-tx-section-title">Basic Information</h2>
                <p className="add-tx-section-subtitle">
                  Specify the parent service, transaction name, description, and handling office details.
                </p>
              </div>
            </div>

            <div className="add-transaction-form-grid">
              <div className="add-transaction-form-group">
                <label htmlFor="serviceId">
                  Service <span className="required-asterisk">*</span>
                </label>
                <select
                  id="serviceId"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Select a service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="add-transaction-form-group">
                <label htmlFor="name">
                  Transaction / Document Name{" "}
                  <span className="required-asterisk">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Enter transaction or document name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="add-transaction-form-group full-width">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  rows="4"
                  placeholder="Enter transaction description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="add-transaction-form-group">
                <label htmlFor="officeName">Office Name</label>
                <input
                  id="officeName"
                  type="text"
                  placeholder="Enter handling office name"
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="add-transaction-form-group">
                <label htmlFor="officeSchedule">Office Schedule</label>
                <input
                  id="officeSchedule"
                  type="text"
                  placeholder="Mon - Fri, 8:00 AM - 5:00 PM"
                  value={officeSchedule}
                  onChange={(e) => handleOfficeScheduleTextChange(e.target.value)}
                  disabled={saving}
                />

                <div className="add-tx-schedule-builder">
                  <div className="add-tx-schedule-days" role="group" aria-label="Select office schedule days">
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = scheduleDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`add-tx-day-chip${isSelected ? " active" : ""}`}
                          onClick={() => handleToggleScheduleDay(day)}
                          disabled={saving}
                          aria-pressed={isSelected}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  <div className="add-tx-schedule-times">
                    <div className="add-tx-time-field">
                      <label htmlFor="scheduleTimeFrom">From</label>
                      <input
                        id="scheduleTimeFrom"
                        type="time"
                        value={scheduleTimeFrom}
                        onChange={(e) => handleScheduleTimeFromChange(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <span className="add-tx-time-separator" aria-hidden="true">
                      –
                    </span>
                    <div className="add-tx-time-field">
                      <label htmlFor="scheduleTimeTo">To</label>
                      <input
                        id="scheduleTimeTo"
                        type="time"
                        value={scheduleTimeTo}
                        onChange={(e) => handleScheduleTimeToChange(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =====================================================
              SECTION 2: REQUIREMENTS SECTION
          ===================================================== */}
          <section className="add-transaction-card add-tx-section-card">
            <div className="add-tx-section-header">
              <div>
                <h2 className="add-tx-section-title">Requirements</h2>
                <p className="add-tx-section-subtitle">
                  Requirements needed for{" "}
                  <strong>{name.trim() || "this transaction"}</strong>.
                </p>
              </div>

              {!showReqForm && (
                <button
                  type="button"
                  className="add-transaction-save-button"
                  onClick={handleOpenAddRequirement}
                  disabled={saving}
                >
                  + Add Requirement
                </button>
              )}
            </div>

            {reqSectionError && (
              <div className="add-transaction-error add-tx-inline-error">
                {reqSectionError}
              </div>
            )}

            {/* Collapsible Form: Only shown after clicking "+ Add Requirement" or "Edit" */}
            {showReqForm && (
              <div className="add-tx-builder-box">
                <h3 className="add-tx-builder-title">
                  {editingReqId ? "Edit Requirement" : "Add Requirement"}
                </h3>

                <div className="add-transaction-form-grid">
                  <div className="add-transaction-form-group">
                    <label htmlFor="reqDraftOrder">Display Order</label>
                    <input
                      id="reqDraftOrder"
                      type="number"
                      min="1"
                      value={reqDraftOrder}
                      onChange={(e) => setReqDraftOrder(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group full-width">
                    <label htmlFor="reqDraftText">Requirement</label>
                    <textarea
                      id="reqDraftText"
                      rows="3"
                      className="add-tx-compact-textarea"
                      placeholder="Enter requirement"
                      value={reqDraftText}
                      onChange={(e) => setReqDraftText(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="add-tx-builder-actions">
                  <button
                    type="button"
                    className="add-transaction-save-button"
                    onClick={handleSaveRequirementItem}
                    disabled={saving}
                  >
                    {editingReqId ? "Save Changes" : "Add Requirement"}
                  </button>
                  <button
                    type="button"
                    className="add-transaction-cancel-button"
                    onClick={handleCloseReqForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Requirements List */}
            {requirements.length === 0 ? (
              <div className="add-tx-empty-list">
                No requirements have been added to this transaction yet.
              </div>
            ) : (
              <div className="add-tx-items-list">
                {requirements.map((item) => (
                  <div key={item.id} className="add-tx-list-item">
                    <div className="add-tx-item-display">
                      <div className="add-tx-item-main">
                        <span className="add-tx-item-badge">
                          {item.displayOrder}
                        </span>
                        <p className="add-tx-item-text">
                          {item.requirementText}
                        </p>
                      </div>
                      <div className="add-tx-item-actions">
                        <button
                          type="button"
                          className="add-transaction-cancel-button add-tx-sm-btn"
                          onClick={() => handleOpenEditRequirement(item)}
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="add-tx-danger-button add-tx-sm-btn"
                          onClick={() => handleRemoveRequirement(item.id)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* =====================================================
              SECTION 3: STEP-BY-STEP PROCEDURE SECTION
          ===================================================== */}
          <section className="add-transaction-card add-tx-section-card">
            <div className="add-tx-section-header">
              <div>
                <h2 className="add-tx-section-title">Step-by-Step Procedure</h2>
                <p className="add-tx-section-subtitle">
                  Manage the procedure for{" "}
                  <strong>{name.trim() || "this transaction"}</strong>.
                </p>
              </div>

              {!showProcForm && (
                <button
                  type="button"
                  className="add-transaction-save-button"
                  onClick={handleOpenAddProcedure}
                  disabled={saving}
                >
                  + Add Step
                </button>
              )}
            </div>

            {procSectionError && (
              <div className="add-transaction-error add-tx-inline-error">
                {procSectionError}
              </div>
            )}

            {/* Collapsible Form: Only shown after clicking "+ Add Step" or "Edit" */}
            {showProcForm && (
              <div className="add-tx-builder-box">
                <h3 className="add-tx-builder-title">
                  {editingProcId ? "Edit Procedure Step" : "Add Procedure Step"}
                </h3>

                <div className="add-transaction-form-grid">
                  <div className="add-transaction-form-group">
                    <label htmlFor="procDraftStepNumber">Step Number</label>
                    <input
                      id="procDraftStepNumber"
                      type="number"
                      min="1"
                      value={procDraftStepNumber}
                      onChange={(e) => setProcDraftStepNumber(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group full-width">
                    <label htmlFor="procDraftInstruction">Instruction</label>
                    <textarea
                      id="procDraftInstruction"
                      rows="3"
                      className="add-tx-compact-textarea"
                      placeholder="Enter step instruction"
                      value={procDraftInstruction}
                      onChange={(e) => setProcDraftInstruction(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group">
                    <label htmlFor="procDraftWebsiteName">
                      Website / Link Name (Optional)
                    </label>
                    <input
                      id="procDraftWebsiteName"
                      type="text"
                      placeholder="e.g. Online Appointment Portal"
                      value={procDraftWebsiteName}
                      onChange={(e) => setProcDraftWebsiteName(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group">
                    <label htmlFor="procDraftWebsiteUrl">
                      Website URL (Optional)
                    </label>
                    <input
                      id="procDraftWebsiteUrl"
                      type="text"
                      placeholder="e.g. https://portal.university.edu.ph"
                      value={procDraftWebsiteUrl}
                      onChange={(e) => setProcDraftWebsiteUrl(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group">
                    <label htmlFor="procDraftImage">
                      Step Image (Optional, max 5MB)
                    </label>
                    <input
                      id="procDraftImage"
                      type="file"
                      accept="image/*"
                      onChange={handleProcDraftImageChange}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group">
                    <label htmlFor="procDraftImageCaption">
                      Image Caption (Optional)
                    </label>
                    <input
                      id="procDraftImageCaption"
                      type="text"
                      placeholder="Caption shown below the step image"
                      value={procDraftImageCaption}
                      onChange={(e) => setProcDraftImageCaption(e.target.value)}
                      disabled={saving || !procDraftImagePreview}
                    />
                  </div>
                </div>

                {procDraftImagePreview && (
                  <div className="add-tx-image-preview-box">
                    <img
                      src={procDraftImagePreview}
                      alt="Step preview"
                      className="add-tx-image-preview"
                    />
                    <button
                      type="button"
                      className="add-tx-danger-button add-tx-sm-btn"
                      onClick={handleClearProcDraftImage}
                      disabled={saving}
                    >
                      Remove Image
                    </button>
                  </div>
                )}

                <div className="add-tx-builder-actions">
                  <button
                    type="button"
                    className="add-transaction-save-button"
                    onClick={handleSaveProcedureItem}
                    disabled={saving}
                  >
                    {editingProcId ? "Save Changes" : "Add Step"}
                  </button>
                  <button
                    type="button"
                    className="add-transaction-cancel-button"
                    onClick={handleCloseProcForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Procedure Steps List */}
            {procedures.length === 0 ? (
              <div className="add-tx-empty-list">
                No procedure steps have been added to this transaction yet.
              </div>
            ) : (
              <div className="add-tx-items-list">
                {procedures.map((step) => (
                  <div key={step.id} className="add-tx-list-item">
                    <div className="add-tx-item-display">
                      <div className="add-tx-item-main add-tx-proc-main">
                        <span className="add-tx-item-badge add-tx-step-badge">
                          Step {step.stepNumber}
                        </span>
                        <div className="add-tx-proc-details">
                          <p className="add-tx-item-text">{step.instruction}</p>

                          {(step.websiteName || step.websiteUrl) && (
                            <p className="add-tx-proc-meta">
                              <strong>Reference Link:</strong>{" "}
                              {step.websiteUrl ? (
                                <a
                                  href={step.websiteUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {step.websiteName || step.websiteUrl}
                                </a>
                              ) : (
                                step.websiteName
                              )}
                            </p>
                          )}

                          {step.imagePreview && (
                            <div className="add-tx-step-thumb-wrap">
                              <img
                                src={step.imagePreview}
                                alt={`Step ${step.stepNumber}`}
                                className="add-tx-step-thumb"
                              />
                              {step.imageCaption && (
                                <span className="add-tx-step-caption">
                                  {step.imageCaption}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="add-tx-item-actions">
                        <button
                          type="button"
                          className="add-transaction-cancel-button add-tx-sm-btn"
                          onClick={() => handleOpenEditProcedure(step)}
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="add-tx-danger-button add-tx-sm-btn"
                          onClick={() => handleRemoveProcedure(step.id)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* =====================================================
              SECTION 4: GUIDELINES SECTION
          ===================================================== */}
          <section className="add-transaction-card add-tx-section-card">
            <div className="add-tx-section-header">
              <div>
                <h2 className="add-tx-section-title">Guidelines</h2>
                <p className="add-tx-section-subtitle">
                  Manage the guidelines for{" "}
                  <strong>{name.trim() || "this transaction"}</strong>.
                </p>
              </div>

              {!showGuideForm && (
                <button
                  type="button"
                  className="add-transaction-save-button"
                  onClick={handleOpenAddGuideline}
                  disabled={saving}
                >
                  + Add Guideline
                </button>
              )}
            </div>

            {guideSectionError && (
              <div className="add-transaction-error add-tx-inline-error">
                {guideSectionError}
              </div>
            )}

            {/* Collapsible Form: Only shown after clicking "+ Add Guideline" or "Edit" */}
            {showGuideForm && (
              <div className="add-tx-builder-box">
                <h3 className="add-tx-builder-title">
                  {editingGuideId ? "Edit Guideline" : "Add Guideline"}
                </h3>

                <div className="add-transaction-form-grid">
                  <div className="add-transaction-form-group">
                    <label htmlFor="guideDraftOrder">Display Order</label>
                    <input
                      id="guideDraftOrder"
                      type="number"
                      min="1"
                      value={guideDraftOrder}
                      onChange={(e) => setGuideDraftOrder(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div className="add-transaction-form-group full-width">
                    <label htmlFor="guideDraftText">Guideline</label>
                    <textarea
                      id="guideDraftText"
                      rows="3"
                      className="add-tx-compact-textarea"
                      placeholder="Enter guideline"
                      value={guideDraftText}
                      onChange={(e) => setGuideDraftText(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="add-tx-builder-actions">
                  <button
                    type="button"
                    className="add-transaction-save-button"
                    onClick={handleSaveGuidelineItem}
                    disabled={saving}
                  >
                    {editingGuideId ? "Save Changes" : "Add Guideline"}
                  </button>
                  <button
                    type="button"
                    className="add-transaction-cancel-button"
                    onClick={handleCloseGuideForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Guidelines List */}
            {guidelines.length === 0 ? (
              <div className="add-tx-empty-list">
                No guidelines have been added to this transaction yet.
              </div>
            ) : (
              <div className="add-tx-items-list">
                {guidelines.map((item) => (
                  <div key={item.id} className="add-tx-list-item">
                    <div className="add-tx-item-display">
                      <div className="add-tx-item-main">
                        <span className="add-tx-item-badge">
                          {item.displayOrder}
                        </span>
                        <p className="add-tx-item-text">{item.guidelineText}</p>
                      </div>
                      <div className="add-tx-item-actions">
                        <button
                          type="button"
                          className="add-transaction-cancel-button add-tx-sm-btn"
                          onClick={() => handleOpenEditGuideline(item)}
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="add-tx-danger-button add-tx-sm-btn"
                          onClick={() => handleRemoveGuideline(item.id)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* =====================================================
              UNIFIED SUBMIT FOOTER BAR
          ===================================================== */}
          <div className="add-transaction-card add-tx-submit-bar">
            <div className="add-tx-submit-summary">
              <span className="add-tx-summary-label">Ready to save:</span>
              <span className="add-tx-summary-pill">
                {requirements.length} Requirement(s)
              </span>
              <span className="add-tx-summary-pill">
                {procedures.length} Procedure Step(s)
              </span>
              <span className="add-tx-summary-pill">
                {guidelines.length} Guideline(s)
              </span>
            </div>

            <div className="add-transaction-actions add-tx-final-actions">
              <button
                type="button"
                className="add-transaction-cancel-button"
                onClick={() => navigate("/transactions")}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="add-transaction-save-button"
                disabled={saving}
              >
                {saving
                  ? savingStatus ||
                    (isEditMode ? "Saving Changes..." : "Saving Transaction...")
                  : isEditMode
                    ? "Save Changes"
                    : "Add Transaction"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTransactionPage;
